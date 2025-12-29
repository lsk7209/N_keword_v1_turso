/**
 * 총검색량 100~999 범위의 시드 키워드 상태를 리셋하는 스크립트
 * 
 * is_expanded = 1 (확장됨) 또는 is_expanded = 2 (실패) 상태를 모두 0으로 리셋
 * 검색량 100~999 범위의 키워드만 리셋
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function resetSeedKeywords100To999() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 총검색량 100~999 범위 시드 키워드 상태 확인 중...\n');

        // 1. 현재 상태 확인
        const statusResult = await client.execute({
            sql: `SELECT 
                    is_expanded,
                    COUNT(*) as count
                  FROM keywords 
                  WHERE total_search_cnt >= 100 AND total_search_cnt < 1000
                  GROUP BY is_expanded
                  ORDER BY is_expanded`,
            args: []
        });

        console.log('📊 현재 상태 (검색량 100~999):');
        statusResult.rows.forEach(row => {
            const status = row.is_expanded as number;
            const count = row.count as number;
            let statusName = '';
            if (status === 0) statusName = '확장 안됨 (시드 가능)';
            else if (status === 1) statusName = '확장됨';
            else if (status === 2) statusName = '확장 실패/Processing';
            else statusName = `알 수 없음 (${status})`;
            
            console.log(`  ${statusName}: ${count.toLocaleString()}개`);
        });
        console.log('');

        // 2. 리셋 대상 확인
        const resetTargetResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE (is_expanded = 1 OR is_expanded = 2) 
                  AND total_search_cnt >= 100 
                  AND total_search_cnt < 1000`,
            args: []
        });
        const resetCount = (resetTargetResult.rows[0]?.count as number) || 0;

        if (resetCount === 0) {
            console.log('✅ 리셋할 키워드가 없습니다.');
            return;
        }

        console.log(`🔄 리셋 대상: ${resetCount.toLocaleString()}개\n`);

        // 3. 리셋 실행
        console.log('🔄 총검색량 100~999 범위 시드 키워드 상태를 0으로 리셋 중...');
        const updateResult = await client.execute({
            sql: `UPDATE keywords 
                  SET is_expanded = 0 
                  WHERE (is_expanded = 1 OR is_expanded = 2) 
                  AND total_search_cnt >= 100 
                  AND total_search_cnt < 1000`,
            args: []
        });

        console.log(`✅ ${resetCount.toLocaleString()}개의 키워드를 리셋했습니다.\n`);

        // 4. 리셋 후 상태 확인
        const afterResult = await client.execute({
            sql: `SELECT 
                    is_expanded,
                    COUNT(*) as count
                  FROM keywords 
                  WHERE total_search_cnt >= 100 AND total_search_cnt < 1000
                  GROUP BY is_expanded
                  ORDER BY is_expanded`,
            args: []
        });

        console.log('─'.repeat(100));
        console.log('📊 리셋 후 상태 (검색량 100~999):');
        afterResult.rows.forEach(row => {
            const status = row.is_expanded as number;
            const count = row.count as number;
            let statusName = '';
            if (status === 0) statusName = '확장 안됨 (시드 가능)';
            else if (status === 1) statusName = '확장됨';
            else if (status === 2) statusName = '확장 실패/Processing';
            else statusName = `알 수 없음 (${status})`;
            
            console.log(`  ${statusName}: ${count.toLocaleString()}개`);
        });
        console.log('');

        // 5. 확장 가능한 시드 키워드 수 확인
        const availableResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 100 
                  AND total_search_cnt < 1000`,
            args: []
        });
        const availableCount = (availableResult.rows[0]?.count as number) || 0;

        console.log('─'.repeat(100));
        console.log('🎯 확장 가능한 시드 키워드 (검색량 100~999):');
        console.log(`   ${availableCount.toLocaleString()}개\n`);

        // 6. 샘플 확인
        const sampleResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt 
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 100 
                  AND total_search_cnt < 1000
                  ORDER BY total_search_cnt DESC 
                  LIMIT 20`,
            args: []
        });

        if (sampleResult.rows.length > 0) {
            console.log('📋 확장 가능한 키워드 샘플 (검색량 높은 순, 상위 20개):');
            sampleResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()})`);
            });
            console.log('');
        }

        // 7. 검색량 구간별 통계
        const rangeStatsResult = await client.execute({
            sql: `SELECT 
                    CASE 
                        WHEN total_search_cnt >= 100 AND total_search_cnt < 200 THEN '100-199'
                        WHEN total_search_cnt >= 200 AND total_search_cnt < 300 THEN '200-299'
                        WHEN total_search_cnt >= 300 AND total_search_cnt < 400 THEN '300-399'
                        WHEN total_search_cnt >= 400 AND total_search_cnt < 500 THEN '400-499'
                        WHEN total_search_cnt >= 500 AND total_search_cnt < 600 THEN '500-599'
                        WHEN total_search_cnt >= 600 AND total_search_cnt < 700 THEN '600-699'
                        WHEN total_search_cnt >= 700 AND total_search_cnt < 800 THEN '700-799'
                        WHEN total_search_cnt >= 800 AND total_search_cnt < 900 THEN '800-899'
                        WHEN total_search_cnt >= 900 AND total_search_cnt < 1000 THEN '900-999'
                        ELSE '기타'
                    END as range_group,
                    COUNT(*) as count
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 100 
                  AND total_search_cnt < 1000
                  GROUP BY range_group
                  ORDER BY range_group`,
            args: []
        });

        if (rangeStatsResult.rows.length > 0) {
            console.log('─'.repeat(100));
            console.log('📊 검색량 구간별 확장 가능한 키워드 수:');
            rangeStatsResult.rows.forEach(row => {
                const range = row.range_group as string;
                const count = row.count as number;
                console.log(`  ${range}: ${count.toLocaleString()}개`);
            });
            console.log('');
        }

        console.log('─'.repeat(100));
        console.log('✅ 리셋 완료!');
        console.log('   이제 자동 수집 시스템이 총검색량 100~999 범위의 키워드를 처음부터 다시 확장할 것입니다.');
        console.log('   GitHub Actions가 15분마다 실행되며, 배치 크기 300으로 확장을 진행합니다.');
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

resetSeedKeywords100To999();

