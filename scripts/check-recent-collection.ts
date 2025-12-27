/**
 * 최근 수집 현황 확인 스크립트
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkRecentCollection() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 최근 수집 현황 확인 중...\n');

        // 최근 24시간 수집된 키워드
        const last24h = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE created_at > datetime('now', '-24 hours')`,
            args: []
        });
        const count24h = (last24h.rows[0]?.count as number) || 0;

        // 최근 1시간 수집된 키워드
        const last1h = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE created_at > datetime('now', '-1 hour')`,
            args: []
        });
        const count1h = (last1h.rows[0]?.count as number) || 0;

        // 최근 10분 수집된 키워드
        const last10m = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE created_at > datetime('now', '-10 minutes')`,
            args: []
        });
        const count10m = (last10m.rows[0]?.count as number) || 0;

        // 최근 확장된 키워드 (is_expanded = 1로 변경된 것)
        const recentExpanded = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE updated_at > datetime('now', '-1 hour') AND is_expanded = 1`,
            args: []
        });
        const expanded1h = (recentExpanded.rows[0]?.count as number) || 0;

        // 최근 확장된 키워드 샘플
        const recentExpandedSample = await client.execute({
            sql: `SELECT keyword, total_search_cnt, updated_at FROM keywords WHERE updated_at > datetime('now', '-1 hour') AND is_expanded = 1 ORDER BY updated_at DESC LIMIT 10`,
            args: []
        });

        // 최근 생성된 키워드 샘플
        const recentCreated = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at FROM keywords WHERE created_at > datetime('now', '-1 hour') ORDER BY created_at DESC LIMIT 10`,
            args: []
        });

        console.log('─'.repeat(100));
        console.log('📊 최근 수집 현황');
        console.log('─'.repeat(100));
        console.log(`최근 24시간 수집: ${count24h.toLocaleString()}개`);
        console.log(`최근 1시간 수집: ${count1h.toLocaleString()}개`);
        console.log(`최근 10분 수집: ${count10m.toLocaleString()}개`);
        console.log(`최근 1시간 확장: ${expanded1h.toLocaleString()}개`);
        console.log('');

        if (count1h === 0) {
            console.log('⚠️ 경고: 최근 1시간 동안 새로운 키워드가 수집되지 않았습니다!');
            console.log('');
        }

        if (recentCreated.rows.length > 0) {
            console.log('📋 최근 생성된 키워드 샘플 (상위 10개):');
            console.log('─'.repeat(100));
            recentCreated.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 생성: ${createdDate}`);
            });
            console.log('');
        }

        if (recentExpandedSample.rows.length > 0) {
            console.log('📋 최근 확장된 키워드 샘플 (상위 10개):');
            console.log('─'.repeat(100));
            recentExpandedSample.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const updatedAt = row.updated_at as string;
                const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 확장: ${updatedDate}`);
            });
            console.log('');
        }

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkRecentCollection();

