/**
 * 데이터베이스에 없는 새로운 키워드 발굴 스크립트 (직접 API 호출 버전)
 * 
 * 시드 키워드로부터 연관 검색어를 가져와서 DB에 없는 것만 필터링
 * 
 * 사용법:
 *   npx tsx scripts/find-new-keywords-direct.ts "시드키워드"
 *   npx tsx scripts/find-new-keywords-direct.ts "허리통증" --min-volume 1000
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// 환경 변수를 먼저 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const NAVER_AD_API_KEYS = process.env.NAVER_AD_API_KEYS;

async function generateSignature(timestamp: string, method: string, uri: string, secretKey: string) {
    const message = `${timestamp}.${method}.${uri}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const msgData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, msgData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function fetchRelatedKeywordsDirect(seed: string) {
    if (!NAVER_AD_API_KEYS) {
        throw new Error('NAVER_AD_API_KEYS 환경 변수가 설정되지 않았습니다.');
    }

    const keys = JSON.parse(NAVER_AD_API_KEYS);
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('유효한 AD API 키가 없습니다.');
    }

    // 첫 번째 키 사용
    const keyConfig = keys[0];
    let accessKey: string;
    let secretKey: string;
    let customerId: string | undefined;

    if (typeof keyConfig === 'object' && keyConfig.key) {
        accessKey = keyConfig.key.trim();
        secretKey = keyConfig.secret ? keyConfig.secret.trim() : '';
        customerId = keyConfig.cust || keyConfig.customerId;
    } else if (typeof keyConfig === 'string') {
        const parts = keyConfig.split(':');
        accessKey = parts[0] || '';
        secretKey = parts[1] || '';
        customerId = parts[2];
    } else {
        throw new Error('잘못된 키 형식입니다.');
    }

    if (!accessKey || !secretKey) {
        throw new Error('Access Key 또는 Secret Key가 없습니다.');
    }

    const timestamp = Date.now().toString();
    const method = 'GET';
    const uri = '/keywordstool';

    const signature = await generateSignature(timestamp, method, uri, secretKey);

    const params = new URLSearchParams();
    params.append('hintKeywords', seed);
    params.append('showDetail', '1');

    const url = `https://api.naver.com${uri}?${params.toString()}`;

    const headers: Record<string, string> = {
        'X-Timestamp': timestamp,
        'X-API-KEY': accessKey,
        'X-Signature': signature,
    };

    if (customerId) {
        headers['X-Customer'] = customerId;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data.keywordList || [];
}

async function findNewKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ Turso 환경 변수가 설정되지 않았습니다.');
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
        let maxKeywords = 0;

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
            console.log('  npx tsx scripts/find-new-keywords-direct.ts "시드키워드"');
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
        const rawKeywords = await fetchRelatedKeywordsDirect(seedKeyword);
        
        if (!rawKeywords || rawKeywords.length === 0) {
            console.log('❌ 연관 검색어를 찾을 수 없습니다.');
            return;
        }

        console.log(`✅ ${rawKeywords.length}개의 연관 검색어 발견\n`);

        // 2. API 응답 파싱
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
                keyword: item.relKeyword.replace(/\s+/g, ''),
                total_search_cnt: total,
                pc_search_cnt: pcCnt,
                mo_search_cnt: moCnt,
                pc_click_cnt: pcClickCnt,
                mo_click_cnt: moClickCnt,
                click_cnt: totalClickCnt,
                pc_ctr: pcCtr,
                mo_ctr: moCtr,
                total_ctr: totalCtr,
                comp_idx: item.compIdx,
                pl_avg_depth: Math.round(parseCnt(item.plAvgDepth))
            };
        });

        // 3. 검색량 필터링
        const filteredKeywords = parsedKeywords
            .filter((kw: any) => kw.total_search_cnt >= minSearchVolume)
            .sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt)
            .slice(0, maxKeywords || parsedKeywords.length);

        console.log(`📊 검색량 필터링 후: ${filteredKeywords.length}개\n`);

        // 4. DB에 있는 키워드 확인
        console.log('🔍 데이터베이스에서 기존 키워드 확인 중...');
        const keywordsToCheck = filteredKeywords.map((kw: any) => kw.keyword);
        
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

        // 5. 새로운 키워드 필터링
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

        // 6. 결과 출력
        console.log('📋 새로운 키워드 목록:\n');
        newKeywords.forEach((kw, idx) => {
            console.log(`${idx + 1}. ${kw.keyword}`);
            console.log(`   검색량: ${kw.total_search_cnt.toLocaleString()} (PC: ${kw.pc_search_cnt.toLocaleString()}, Mobile: ${kw.mo_search_cnt.toLocaleString()})`);
            console.log(`   클릭수: ${kw.click_cnt.toLocaleString()}, CTR: ${kw.total_ctr.toFixed(2)}%`);
            if (kw.comp_idx) {
                console.log(`   경쟁지수: ${kw.comp_idx}`);
            }
            console.log('');
        });

        // 7. 통계
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

        // 8. 저장 제안
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

findNewKeywords();

