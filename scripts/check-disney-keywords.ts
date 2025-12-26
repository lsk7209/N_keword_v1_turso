/**
 * "디즈니플러스" 관련 수동 수집 키워드가 DB에 저장되었는지 확인
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkDisneyKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 "디즈니플러스" 관련 수동 수집 키워드 확인 중...\n');

        // 화면에 표시된 키워드들 확인
        const keywordsToCheck = [
            '디즈니플러스',
            '디즈니',
            '디즈니플러스할인',
            '도쿄디즈니랜드',
            '파텍필립',
            '디즈니플러스추천',
            '리락쿠마',
            '헬로키티',
            '디즈니랜드',
            '지샥',
            '이치방쿠지',
            '오타마톤',
            '지브리',
            '디지니+',
            '일본디즈니랜드',
            '드래곤볼',
            '디즈니플러스가격',
            '디즈니플러스드라마',
            '디지몬',
            '바니걸',
            '디즈니플러스오리지널',
            '건담베이스',
            '지브리파크',
            '블라이스',
            '타미야',
            '미우미우안경',
            '디즈니플러스요금제',
            '귀멸의칼날레고',
            '아이언커버',
            '얼음낚시',
            '골프가방',
            '부쉬넬',
            '디지니',
            '코브라드라이버',
            '디즈니애니메이션',
            '골든카무이',
            '디즈니+',
            'PXG모자',
            'PSP',
            '키덜트',
            '그로밋인형',
            '동물피규어',
            '태그호이어아쿠아레이서',
            '루어낚시대',
            '하츠네미쿠피규어',
            '가오가이거',
            '디즈니요금제',
            '디즈니플러스공유',
            '로드케이스',
            '드리프트RC카',
            'DISNEY',
            '중고휠',
            '골프채세트',
            '디즈니플러스화질',
            '레이쿡퍼터',
            'FPV드론',
            '지브리미술관',
            '디즈니플러스구독',
            '고질라피규어',
            '동계낚시복',
            '골프파우치백',
            '왕눈이에기',
            '디즈니플러스추천작',
            '사이드쇼',
            '남성겨울골프바지',
            '푸른눈의백룡',
            '메탈바이브',
            '하이큐굿즈',
            '디즈니구독',
            'DISNEYPLUS',
            '마그네틱드릴',
            '디즈니할인',
            '쯔리겐구멍찌',
            '로마로웨지',
            'MGEX유니콘',
            '말렛퍼터커버',
            '디즈니플러스가입',
            '스텔라릴',
            '스마트전자찌',
            '로봇혼',
            '디즈니플러스순위',
            '반다이피규어',
            '타미야RC카',
            '반프레스토피규어',
            '건담피규어',
            '소프라노색소폰',
            '다이와이그지스트',
            '디즈니플러스구독료',
            '스누피피규어',
            '남자기모노',
            '일본파타고니아',
            '디지몬가챠',
            '대형피규어',
            '디즈니플러스요금',
            '해리포터피규어',
            '디즈니플러스이용권',
            '셀마색소폰',
            '유틸리티커버',
            '디즈니플러스프리미엄',
            '디즈니플러스애니메이션',
            '미즈노글로벌엘리트',
            '디즈니플러스연간구독',
            '보쉬전동공구',
            '데상트모자'
        ];

        console.log(`📋 확인할 키워드 목록: ${keywordsToCheck.length}개\n`);

        // 각 키워드가 DB에 있는지 확인
        const foundKeywords: any[] = [];
        const notFoundKeywords: string[] = [];
        const recentlyCreated: any[] = [];

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        for (const keyword of keywordsToCheck) {
            const result = await client.execute({
                sql: 'SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt, created_at, updated_at FROM keywords WHERE keyword = ?',
                args: [keyword]
            });

            if (result.rows.length > 0) {
                const row = result.rows[0];
                foundKeywords.push(row);
                
                // 최근 1시간 내 생성된 키워드 확인
                const createdAt = row.created_at as string;
                if (createdAt && new Date(createdAt) >= new Date(oneHourAgo)) {
                    recentlyCreated.push(row);
                }
            } else {
                notFoundKeywords.push(keyword);
            }
        }

        console.log('─'.repeat(100));
        console.log(`✅ DB에 저장된 키워드: ${foundKeywords.length}개`);
        console.log(`❌ DB에 없는 키워드: ${notFoundKeywords.length}개`);
        console.log(`🆕 최근 1시간 내 생성된 키워드: ${recentlyCreated.length}개`);
        console.log('─'.repeat(100));
        console.log('');

        if (notFoundKeywords.length > 0) {
            console.log('❌ DB에 없는 키워드 목록:');
            notFoundKeywords.forEach((kw, idx) => {
                console.log(`   ${idx + 1}. ${kw}`);
            });
            console.log('');
        }

        if (recentlyCreated.length > 0) {
            console.log('🆕 최근 1시간 내 생성된 키워드 (새로 저장된 것으로 보임):');
            recentlyCreated.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`   ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - ${createdDate}`);
            });
            console.log('');
        }

        // 최근 10분 내 생성된 모든 키워드 확인
        console.log('🔍 최근 10분 내 생성된 모든 키워드:');
        const recentAllResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at 
                  FROM keywords 
                  WHERE created_at >= datetime('now', '-10 minutes')
                  ORDER BY created_at DESC
                  LIMIT 20`,
            args: []
        });

        if (recentAllResult.rows.length > 0) {
            console.log(`   총 ${recentAllResult.rows.length}개 발견:`);
            recentAllResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`   ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - ${createdDate}`);
            });
        } else {
            console.log('   최근 10분 내 생성된 키워드가 없습니다.');
        }
        console.log('');

        // 요약
        console.log('─'.repeat(100));
        console.log('📊 요약:');
        console.log(`   - 확인한 키워드: ${keywordsToCheck.length}개`);
        console.log(`   - DB에 저장됨: ${foundKeywords.length}개`);
        console.log(`   - DB에 없음: ${notFoundKeywords.length}개`);
        console.log(`   - 최근 1시간 내 생성: ${recentlyCreated.length}개`);
        
        if (notFoundKeywords.length > 0) {
            console.log(`\n⚠️ 경고: ${notFoundKeywords.length}개의 키워드가 DB에 저장되지 않았습니다!`);
        } else if (recentlyCreated.length === 0 && foundKeywords.length === keywordsToCheck.length) {
            console.log(`\n💡 참고: 모든 키워드가 DB에 있지만, 최근 1시간 내 생성된 것은 없습니다.`);
            console.log(`   이는 이미 이전에 저장되어 있었던 키워드들입니다.`);
        } else {
            console.log(`\n✅ 정상: 모든 키워드가 DB에 저장되어 있습니다.`);
        }
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkDisneyKeywords();

