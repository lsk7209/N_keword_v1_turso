/**
 * Turso 데이터베이스 상태 확인 스크립트
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
    console.error('❌ Turso 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
}

const turso = createClient({
    url: tursoUrl,
    authToken: tursoToken,
});

async function checkStats() {
    console.log('📊 Turso 데이터베이스 상태 확인\n');

    try {
        // 1. 전체 키워드 수
        const totalResult = await turso.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords'
        });
        const totalCount = totalResult.rows[0]?.count as number || 0;
        console.log(`📌 전체 키워드 수: ${totalCount.toLocaleString()}개\n`);

        // 2. 검색량별 분포
        const volumeStats = await turso.execute({
            sql: `
                SELECT 
                    CASE 
                        WHEN total_search_cnt >= 10000 THEN '10000+'
                        WHEN total_search_cnt >= 5000 THEN '5000-9999'
                        WHEN total_search_cnt >= 1000 THEN '1000-4999'
                        ELSE '1000 미만'
                    END as range,
                    COUNT(*) as count
                FROM keywords
                GROUP BY range
                ORDER BY 
                    CASE range
                        WHEN '10000+' THEN 1
                        WHEN '5000-9999' THEN 2
                        WHEN '1000-4999' THEN 3
                        ELSE 4
                    END
            `
        });
        console.log('📈 검색량별 분포:');
        volumeStats.rows.forEach(row => {
            console.log(`   ${row.range}: ${(row.count as number).toLocaleString()}개`);
        });
        console.log('');

        // 3. 문서수 수집 상태
        const docStats = await turso.execute({
            sql: `
                SELECT 
                    CASE 
                        WHEN total_doc_cnt IS NULL THEN '문서수 미수집'
                        WHEN total_doc_cnt = -1 THEN '문서수 수집 실패'
                        ELSE '문서수 수집 완료'
                    END as status,
                    COUNT(*) as count
                FROM keywords
                GROUP BY status
            `
        });
        console.log('📄 문서수 수집 상태:');
        docStats.rows.forEach(row => {
            console.log(`   ${row.status}: ${(row.count as number).toLocaleString()}개`);
        });
        console.log('');

        // 4. 확장 상태
        const expandStats = await turso.execute({
            sql: `
                SELECT 
                    CASE 
                        WHEN is_expanded = 0 THEN '미확장'
                        WHEN is_expanded = 1 THEN '확장 완료'
                        ELSE '알 수 없음'
                    END as status,
                    COUNT(*) as count
                FROM keywords
                GROUP BY status
            `
        });
        console.log('🔍 확장 상태:');
        expandStats.rows.forEach(row => {
            console.log(`   ${row.status}: ${(row.count as number).toLocaleString()}개`);
        });
        console.log('');

        // 5. 등급별 분포
        const tierStats = await turso.execute({
            sql: `
                SELECT tier, COUNT(*) as count
                FROM keywords
                GROUP BY tier
                ORDER BY 
                    CASE tier
                        WHEN '1등급' THEN 1
                        WHEN '2등급' THEN 2
                        WHEN '3등급' THEN 3
                        WHEN '4등급' THEN 4
                        WHEN '5등급' THEN 5
                        WHEN 'UNRANKED' THEN 6
                        WHEN 'ERROR' THEN 7
                        ELSE 8
                    END
            `
        });
        console.log('💎 등급별 분포:');
        tierStats.rows.forEach(row => {
            console.log(`   ${row.tier}: ${(row.count as number).toLocaleString()}개`);
        });
        console.log('');

        // 6. 최근 수집된 키워드 (최근 24시간)
        const recentResult = await turso.execute({
            sql: `
                SELECT COUNT(*) as count
                FROM keywords
                WHERE created_at >= datetime('now', '-1 day')
            `
        });
        const recentCount = recentResult.rows[0]?.count as number || 0;
        console.log(`⏰ 최근 24시간 수집: ${recentCount.toLocaleString()}개\n`);

        // 7. 문서수 미수집 중 검색량 높은 키워드 (상위 10개)
        const missingDocsResult = await turso.execute({
            sql: `
                SELECT keyword, total_search_cnt
                FROM keywords
                WHERE total_doc_cnt IS NULL
                ORDER BY total_search_cnt DESC
                LIMIT 10
            `
        });
        if (missingDocsResult.rows.length > 0) {
            console.log('📋 문서수 미수집 키워드 (검색량 상위 10개):');
            missingDocsResult.rows.forEach((row, i) => {
                console.log(`   ${i + 1}. ${row.keyword} (검색량: ${(row.total_search_cnt as number).toLocaleString()})`);
            });
            console.log('');
        }

        // 8. 확장 가능한 키워드 수 (미확장 + 검색량 1000 이상)
        const expandableResult = await turso.execute({
            sql: `
                SELECT COUNT(*) as count
                FROM keywords
                WHERE is_expanded = 0 AND total_search_cnt >= 1000
            `
        });
        const expandableCount = expandableResult.rows[0]?.count as number || 0;
        console.log(`🔍 확장 가능한 키워드: ${expandableCount.toLocaleString()}개 (미확장 + 검색량 1000+)\n`);

    } catch (e: any) {
        console.error('❌ 확인 중 오류 발생:', e.message);
        process.exit(1);
    } finally {
        turso.close();
    }
}

checkStats();

