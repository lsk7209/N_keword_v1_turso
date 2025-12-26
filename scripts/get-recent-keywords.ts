/**
 * Turso 데이터베이스에서 최근 등록된 키워드 조회
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function getRecentKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 최근 등록된 키워드 조회 중...\n');

        const result = await client.execute(`
            SELECT 
                keyword,
                total_search_cnt,
                pc_search_cnt,
                mo_search_cnt,
                total_doc_cnt,
                tier,
                created_at,
                updated_at
            FROM keywords
            ORDER BY created_at DESC
            LIMIT 10
        `);

        if (result.rows.length === 0) {
            console.log('❌ 키워드가 없습니다.');
            return;
        }

        console.log(`✅ 최근 등록된 키워드 ${result.rows.length}개:\n`);
        console.log('─'.repeat(100));
        console.log(
            '순번'.padEnd(5) +
            '키워드'.padEnd(25) +
            '총검색량'.padEnd(12) +
            'PC'.padEnd(10) +
            'Mobile'.padEnd(10) +
            '문서수'.padEnd(10) +
            '등급'.padEnd(12) +
            '등록일시'
        );
        console.log('─'.repeat(100));

        result.rows.forEach((row, idx) => {
            const keyword = (row.keyword as string) || '';
            const totalSearch = (row.total_search_cnt as number) || 0;
            const pcSearch = (row.pc_search_cnt as number) || 0;
            const moSearch = (row.mo_search_cnt as number) || 0;
            const totalDoc = (row.total_doc_cnt as number) || 0;
            const tier = (row.tier as string) || 'UNRANKED';
            const createdAt = (row.created_at as string) || '';
            
            const formattedDate = createdAt 
                ? new Date(createdAt).toLocaleString('ko-KR', { 
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
                : 'N/A';

            console.log(
                `${(idx + 1).toString().padEnd(5)}` +
                `${keyword.substring(0, 24).padEnd(25)}` +
                `${totalSearch.toLocaleString().padEnd(12)}` +
                `${pcSearch.toLocaleString().padEnd(10)}` +
                `${moSearch.toLocaleString().padEnd(10)}` +
                `${totalDoc > 0 ? totalDoc.toLocaleString() : 'N/A'}`.padEnd(10) +
                `${tier.padEnd(12)}` +
                `${formattedDate}`
            );
        });

        console.log('─'.repeat(100));
        console.log('');

        // 통계 정보
        const statsResult = await client.execute(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN total_doc_cnt IS NOT NULL THEN 1 END) as with_docs,
                COUNT(CASE WHEN total_doc_cnt IS NULL THEN 1 END) as without_docs
            FROM keywords
            WHERE created_at >= datetime('now', '-24 hours')
        `);

        const stats = statsResult.rows[0];
        const total24h = (stats?.total as number) || 0;
        const withDocs24h = (stats?.with_docs as number) || 0;
        const withoutDocs24h = (stats?.without_docs as number) || 0;

        console.log('📊 최근 24시간 통계:');
        console.log(`   - 새로 등록된 키워드: ${total24h.toLocaleString()}개`);
        console.log(`   - 문서수 수집 완료: ${withDocs24h.toLocaleString()}개`);
        console.log(`   - 문서수 수집 대기: ${withoutDocs24h.toLocaleString()}개`);
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

getRecentKeywords();

