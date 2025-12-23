/**
 * 총검색량 1000 이하인 키워드 삭제 스크립트
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
    console.error('필요한 변수: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN');
    process.exit(1);
}

const turso = createClient({
    url: tursoUrl,
    authToken: tursoToken,
});

async function deleteLowVolumeKeywords() {
    console.log('🔍 총검색량 1000 이하인 키워드 확인 중...\n');

    try {
        // 1. 삭제될 키워드 수 확인
        const countResult = await turso.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE total_search_cnt < 1000'
        });

        const count = countResult.rows[0]?.count as number || 0;

        if (count === 0) {
            console.log('✅ 총검색량 1000 이하인 키워드가 없습니다.');
            return;
        }

        console.log(`⚠️  삭제될 키워드 수: ${count}개\n`);

        // 2. 샘플 데이터 확인 (최대 10개)
        const sampleResult = await turso.execute({
            sql: 'SELECT keyword, total_search_cnt FROM keywords WHERE total_search_cnt < 1000 LIMIT 10'
        });

        if (sampleResult.rows.length > 0) {
            console.log('📋 삭제될 키워드 샘플:');
            sampleResult.rows.forEach((row, i) => {
                console.log(`   ${i + 1}. ${row.keyword} (검색량: ${row.total_search_cnt})`);
            });
            console.log('');
        }

        // 3. 삭제 실행
        console.log('🗑️  키워드 삭제 중...');
        const deleteResult = await turso.execute({
            sql: 'DELETE FROM keywords WHERE total_search_cnt < 1000'
        });

        console.log(`✅ 총 ${deleteResult.rowsAffected}개 키워드 삭제 완료\n`);

        // 4. 삭제 후 전체 키워드 수 확인
        const totalResult = await turso.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords'
        });
        const totalCount = totalResult.rows[0]?.count as number || 0;
        console.log(`📊 현재 전체 키워드 수: ${totalCount}개`);

    } catch (e: any) {
        console.error('❌ 삭제 중 오류 발생:', e.message);
        process.exit(1);
    } finally {
        turso.close();
    }
}

deleteLowVolumeKeywords();

