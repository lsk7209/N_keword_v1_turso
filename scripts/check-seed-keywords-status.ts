/**
 * 시드 키워드 상태 확인 스크립트
 * 
 * DB에 있는 키워드 중 확장 가능한 키워드(is_expanded = 0)가 있는지 확인
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkSeedKeywordsStatus() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 시드 키워드 상태 확인 중...\n');

        // 1. 전체 키워드 통계
        const totalResult = await client.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords',
            args: []
        });
        const totalKeywords = (totalResult.rows[0]?.count as number) || 0;

        // 2. is_expanded 상태별 통계
        const expandedStatusResult = await client.execute({
            sql: `SELECT 
                    is_expanded,
                    COUNT(*) as count,
                    SUM(CASE WHEN total_search_cnt >= 1000 THEN 1 ELSE 0 END) as count_above_1000
                  FROM keywords 
                  GROUP BY is_expanded
                  ORDER BY is_expanded`,
            args: []
        });

        // 3. total_search_cnt >= 1000 조건을 만족하는 키워드 중 확장 가능한 것
        const availableSeedsResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE total_search_cnt >= 1000 
                  AND (is_expanded = 0 OR is_expanded = 2)`,
            args: []
        });
        const availableSeeds = (availableSeedsResult.rows[0]?.count as number) || 0;

        // 4. is_expanded = 0 (확장 안됨) 키워드 중 검색량 1000 이상
        const notExpandedResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 1000`,
            args: []
        });
        const notExpanded = (notExpandedResult.rows[0]?.count as number) || 0;

        // 5. is_expanded = 1 (확장됨) 키워드 중 검색량 1000 이상
        const expandedResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 1 
                  AND total_search_cnt >= 1000`,
            args: []
        });
        const expanded = (expandedResult.rows[0]?.count as number) || 0;

        // 6. is_expanded = 2 (확장 실패) 키워드 중 검색량 1000 이상
        const failedResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 2 
                  AND total_search_cnt >= 1000`,
            args: []
        });
        const failed = (failedResult.rows[0]?.count as number) || 0;

        // 7. 최근 확장된 키워드 샘플 (is_expanded = 1, 최근 updated_at 기준)
        const recentlyExpandedResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, updated_at 
                  FROM keywords 
                  WHERE is_expanded = 1 
                  AND total_search_cnt >= 1000
                  ORDER BY updated_at DESC 
                  LIMIT 10`,
            args: []
        });

        // 8. 확장 가능한 키워드 샘플 (is_expanded = 0, 검색량 높은 순)
        const availableSeedsSampleResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at 
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 1000
                  ORDER BY total_search_cnt DESC 
                  LIMIT 20`,
            args: []
        });

        // 결과 출력
        console.log('─'.repeat(100));
        console.log('📊 전체 키워드 통계');
        console.log('─'.repeat(100));
        console.log(`총 키워드 수: ${totalKeywords.toLocaleString()}개\n`);

        console.log('📊 is_expanded 상태별 통계 (검색량 >= 1000):');
        console.log('─'.repeat(100));
        expandedStatusResult.rows.forEach(row => {
            const status = row.is_expanded as number;
            const count = row.count as number;
            const countAbove1000 = row.count_above_1000 as number;
            let statusName = '';
            if (status === 0) statusName = '확장 안됨 (시드 가능)';
            else if (status === 1) statusName = '확장됨';
            else if (status === 2) statusName = '확장 실패 (재시도 가능)';
            else statusName = `알 수 없음 (${status})`;
            
            console.log(`  ${statusName}: ${count.toLocaleString()}개 (검색량 >= 1000: ${countAbove1000.toLocaleString()}개)`);
        });
        console.log('');

        console.log('─'.repeat(100));
        console.log('🎯 확장 가능한 시드 키워드');
        console.log('─'.repeat(100));
        console.log(`확장 가능한 키워드 (is_expanded = 0 또는 2, 검색량 >= 1000): ${availableSeeds.toLocaleString()}개`);
        console.log(`  - 확장 안됨 (is_expanded = 0): ${notExpanded.toLocaleString()}개`);
        console.log(`  - 확장 실패 (is_expanded = 2): ${failed.toLocaleString()}개`);
        console.log(`  - 이미 확장됨 (is_expanded = 1): ${expanded.toLocaleString()}개`);
        console.log('');

        if (availableSeeds === 0) {
            console.log('⚠️ 경고: 확장 가능한 시드 키워드가 없습니다!');
            console.log('   모든 키워드가 이미 확장되었거나, 검색량이 1000 미만입니다.\n');
        } else {
            console.log('✅ 확장 가능한 시드 키워드가 있습니다.\n');
        }

        // 확장 가능한 키워드 샘플
        if (availableSeedsSampleResult.rows.length > 0) {
            console.log('📋 확장 가능한 키워드 샘플 (검색량 높은 순, 상위 20개):');
            console.log('─'.repeat(100));
            availableSeedsSampleResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 생성: ${createdDate}`);
            });
            console.log('');
        }

        // 최근 확장된 키워드 샘플
        if (recentlyExpandedResult.rows.length > 0) {
            console.log('📋 최근 확장된 키워드 샘플 (상위 10개):');
            console.log('─'.repeat(100));
            recentlyExpandedResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const updatedAt = row.updated_at as string;
                const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 확장일시: ${updatedDate}`);
            });
            console.log('');
        }

        // 분석 및 권장사항
        console.log('─'.repeat(100));
        console.log('💡 분석 및 권장사항');
        console.log('─'.repeat(100));
        
        if (availableSeeds === 0) {
            console.log('1. 모든 키워드가 이미 확장되었습니다.');
            console.log('2. 새로운 시드 키워드를 수동으로 추가하거나,');
            console.log('3. is_expanded = 1인 키워드를 재확장하도록 설정을 변경해야 합니다.');
            console.log('   (현재 batch-runner.ts는 is_expanded = 1도 포함하여 재확장하도록 설정되어 있습니다)');
        } else {
            console.log(`1. ${availableSeeds.toLocaleString()}개의 확장 가능한 시드 키워드가 있습니다.`);
            console.log('2. 자동 수집 시스템이 이 키워드들을 처리할 것입니다.');
            console.log('3. 만약 자동 수집이 작동하지 않는다면, cron job 설정을 확인하세요.');
        }
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkSeedKeywordsStatus();

