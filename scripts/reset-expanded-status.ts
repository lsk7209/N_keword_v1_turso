/**
 * is_expanded = 2 (Processing) 상태인 키워드를 0으로 리셋하는 스크립트
 * 
 * 확장 실패나 Processing 상태로 남아있는 키워드들을 다시 확장 가능하도록 리셋
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function resetExpandedStatus() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 is_expanded = 2 상태인 키워드 확인 중...\n');

        // 1. is_expanded = 2인 키워드 수 확인
        const countResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 2 
                  AND total_search_cnt >= 1000`,
            args: []
        });
        const count = (countResult.rows[0]?.count as number) || 0;

        if (count === 0) {
            console.log('✅ 리셋할 키워드가 없습니다.');
            return;
        }

        console.log(`📊 is_expanded = 2 상태인 키워드: ${count.toLocaleString()}개\n`);

        // 2. 샘플 확인
        const sampleResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, updated_at 
                  FROM keywords 
                  WHERE is_expanded = 2 
                  AND total_search_cnt >= 1000
                  ORDER BY total_search_cnt DESC 
                  LIMIT 10`,
            args: []
        });

        console.log('📋 리셋 대상 키워드 샘플 (상위 10개):');
        sampleResult.rows.forEach((row, idx) => {
            const keyword = row.keyword as string;
            const totalSearch = row.total_search_cnt as number;
            const updatedAt = row.updated_at as string;
            const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';
            console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 수정: ${updatedDate}`);
        });
        console.log('');

        // 3. 리셋 실행
        console.log('🔄 is_expanded = 2 → 0으로 리셋 중...');
        const updateResult = await client.execute({
            sql: `UPDATE keywords 
                  SET is_expanded = 0 
                  WHERE is_expanded = 2 
                  AND total_search_cnt >= 1000`,
            args: []
        });

        console.log(`✅ ${count.toLocaleString()}개의 키워드를 리셋했습니다.\n`);

        // 4. 확인
        const verifyResult = await client.execute({
            sql: `SELECT COUNT(*) as count 
                  FROM keywords 
                  WHERE is_expanded = 0 
                  AND total_search_cnt >= 1000`,
            args: []
        });
        const newCount = (verifyResult.rows[0]?.count as number) || 0;

        console.log('─'.repeat(100));
        console.log('📊 리셋 후 상태:');
        console.log(`확장 가능한 키워드 (is_expanded = 0, 검색량 >= 1000): ${newCount.toLocaleString()}개`);
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

resetExpandedStatus();

