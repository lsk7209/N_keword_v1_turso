/**
 * 데이터베이스에 없는 새로운 키워드 발굴 스크립트
 * 
 * 시드 키워드로부터 연관 검색어를 가져와서 DB에 없는 것만 필터링
 * 
 * 사용법:
 *   npx tsx scripts/find-new-keywords.ts "시드키워드"
 *   npx tsx scripts/find-new-keywords.ts "허리통증" --min-volume 1000
 *   npx tsx scripts/find-new-keywords.ts "디즈니" --max-keywords 500
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// 환경 변수를 먼저 로드 (keyManager import 전에)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

// 환경 변수 로드 후에 import
import { createClient } from '@libsql/client';
import { fetchRelatedKeywords } from '@/utils/naver-api';

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function findNewKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        // 명령줄 인자 파싱
        const args = process.argv.slice(2);
        let seedKeyword = '';
        let minSearchVolume = 1000;
        let maxKeywords = 0; // 0 = 무제한

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--min-volume' && args[i + 1]) {
                minSearchVolume = parseInt(args[i + 1], 10);
                i++;
            } else if (args[i] === '--max-keywords' && args[i + 1]) {
                maxKeywords = parseInt(args[i + 1], 10);
                i++;
            } else if (!args[i].startsWith('--')) {
                seedKeyword = args[i];
            }
        }

        if (!seedKeyword) {
            console.error('❌ 시드 키워드를 입력해주세요.');
            console.log('\n사용법:');
            console.log('  npx tsx scripts/find-new-keywords.ts "시드키워드"');
            console.log('  npx tsx scripts/find-new-keywords.ts "허리통증" --min-volume 1000');
            process.exit(1);
        }

        console.log('🔍 새로운 키워드 발굴 시작\n');
        console.log(`시드 키워드: ${seedKeyword}`);
        console.log(`최소 검색량: ${minSearchVolume.toLocaleString()}`);
        console.log(`최대 키워드: ${maxKeywords || '무제한'}`);
        console.log('─'.repeat(100));
        console.log('');

        // 1. 네이버 API에서 연관 검색어 가져오기
        console.log('📡 네이버 API에서 연관 검색어 가져오는 중...');
        const rawKeywords = await fetchRelatedKeywords(seedKeyword);
        
        if (!rawKeywords || rawKeywords.length === 0) {
            console.log('❌ 연관 검색어를 찾을 수 없습니다.');
            return;
        }

        console.log(`✅ ${rawKeywords.length}개의 연관 검색어 발견\n`);

        // 2. API 응답 파싱 (mining-engine.ts와 동일한 로직)
        const parseCnt = (val: string | number) => {
            if (typeof val === 'string' && val.includes('<')) return 5;
            const num = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
            return isNaN(num) ? 0 : Math.round(num);
        };

        const parseFloat = (val: string | number) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.includes('<')) return 0.1;
            return Number(String(val).replace(/,/g, '')) || 0;
        };

        const parsedKeywords = rawKeywords.map((item: any) => {
            const pcCnt = parseCnt(item.monthlyPcQcCnt);
            const moCnt = parseCnt(item.monthlyMobileQcCnt);
            const total = Math.round(pcCnt + moCnt);

            const pcClickCnt = parseCnt(item.monthlyAvePcClkCnt);
            const moClickCnt = parseCnt(item.monthlyAveMobileClkCnt);
            const totalClickCnt = Math.round(pcClickCnt + moClickCnt);

            const pcCtr = parseFloat(item.monthlyAvePcCtr);
            const moCtr = parseFloat(item.monthlyAveMobileCtr);
            const totalCtr = (pcCtr + moCtr) / 2;

            return {
                keyword: item.relKeyword,
                total_search_cnt: total,
                pc_search_cnt: pcCnt,
                mo_search_cnt: moCnt,
                pc_click_cnt: pcClickCnt,
                mo_click_cnt: moClickCnt,
                click_cnt: totalClickCnt,
                pc_ctr: pcCtr,
                mo_ctr: moCtr,
                total_ctr: totalCtr,
                comp_idx: item.plAvgDepth ? parseFloat(item.plAvgDepth) : null,
                pl_avg_depth: item.plAvgDepth ? parseFloat(item.plAvgDepth) : 0,
            };
        });

        // 3. 검색량 필터링
        const filteredKeywords = parsedKeywords
            .filter((kw: any) => kw.total_search_cnt >= minSearchVolume)
            .sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt)
            .slice(0, maxKeywords || parsedKeywords.length);

        console.log(`📊 검색량 필터링 후: ${filteredKeywords.length}개\n`);

        // 3. DB에 있는 키워드 확인
        console.log('🔍 데이터베이스에서 기존 키워드 확인 중...');
        const keywordsToCheck = filteredKeywords.map((kw: any) => kw.keyword);
        
        // 배치로 확인 (SQLite IN 절은 최대 999개까지)
        const existingKeywordsSet = new Set<string>();
        const batchSize = 500;
        
        for (let i = 0; i < keywordsToCheck.length; i += batchSize) {
            const batch = keywordsToCheck.slice(i, i + batchSize);
            const placeholders = batch.map(() => '?').join(',');
            
            const result = await client.execute({
                sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
                args: batch
            });
            
            result.rows.forEach(row => {
                existingKeywordsSet.add(row.keyword as string);
            });
        }

        console.log(`✅ DB에 이미 존재하는 키워드: ${existingKeywordsSet.size}개\n`);

        // 4. 새로운 키워드 필터링
        const newKeywords = filteredKeywords.filter(
            (kw: any) => !existingKeywordsSet.has(kw.keyword)
        );

        console.log('─'.repeat(100));
        console.log(`🎯 새로운 키워드 발견: ${newKeywords.length}개\n`);

        if (newKeywords.length === 0) {
            console.log('💡 모든 키워드가 이미 데이터베이스에 존재합니다.');
            console.log('   다른 시드 키워드로 시도해보세요.\n');
            return;
        }

        // 5. 결과 출력
        console.log('📋 새로운 키워드 목록:\n');
        newKeywords.forEach((kw: any, idx: number) => {
            console.log(`${idx + 1}. ${kw.keyword}`);
            console.log(`   검색량: ${kw.total_search_cnt.toLocaleString()} (PC: ${kw.pc_search_cnt.toLocaleString()}, Mobile: ${kw.mo_search_cnt.toLocaleString()})`);
            console.log(`   클릭수: ${kw.click_cnt.toLocaleString()}, CTR: ${kw.total_ctr.toLocaleString()}%`);
            if (kw.comp_idx) {
                console.log(`   경쟁지수: ${kw.comp_idx}`);
            }
            console.log('');
        });

        // 6. 통계
        const totalSearchVolume = newKeywords.reduce((sum: number, kw: any) => sum + kw.total_search_cnt, 0);
        const avgSearchVolume = Math.round(totalSearchVolume / newKeywords.length);
        const maxSearchVolume = Math.max(...newKeywords.map((kw: any) => kw.total_search_cnt));
        const minSearchVolumeInResults = Math.min(...newKeywords.map((kw: any) => kw.total_search_cnt));

        console.log('─'.repeat(100));
        console.log('📊 통계:');
        console.log(`   총 새로운 키워드: ${newKeywords.length}개`);
        console.log(`   총 검색량 합계: ${totalSearchVolume.toLocaleString()}`);
        console.log(`   평균 검색량: ${avgSearchVolume.toLocaleString()}`);
        console.log(`   최대 검색량: ${maxSearchVolume.toLocaleString()}`);
        console.log(`   최소 검색량: ${minSearchVolumeInResults.toLocaleString()}`);
        console.log('');

        // 7. 저장 제안
        console.log('💡 이 키워드들을 데이터베이스에 저장하려면:');
        console.log(`   수동 수집 페이지에서 "${seedKeyword}"를 입력하거나,`);
        console.log(`   자동 수집 시스템이 이 키워드들을 처리할 것입니다.`);
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

// 사용법 안내
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
데이터베이스에 없는 새로운 키워드 발굴 스크립트

사용법:
  npx tsx scripts/find-new-keywords.ts "시드키워드" [옵션]

예시:
  # 기본 사용
  npx tsx scripts/find-new-keywords.ts "허리통증"
  
  # 최소 검색량 5000 이상
  npx tsx scripts/find-new-keywords.ts "디즈니" --min-volume 5000
  
  # 최대 100개만 확인
  npx tsx scripts/find-new-keywords.ts "일본여행" --max-keywords 100
  
  # 조합
  npx tsx scripts/find-new-keywords.ts "골프" --min-volume 2000 --max-keywords 50

옵션:
  --min-volume N      최소 검색량 필터 (기본값: 1000)
  --max-keywords N    최대 확인할 키워드 수 (기본값: 무제한)
  --help, -h         도움말 표시

참고:
  - 네이버 API 키가 필요합니다 (NAVER_AD_API_KEYS)
  - 시드 키워드로부터 연관 검색어를 가져와서 DB에 없는 것만 필터링합니다
  - 결과는 수동 수집이나 자동 수집으로 저장할 수 있습니다
`);
    process.exit(0);
}

findNewKeywords();

