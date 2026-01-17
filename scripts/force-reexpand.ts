
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function forceReexpand() {
    const db = getTursoClient();
    console.log('🔄 Forcing re-expansion of collected keywords...');

    // 1. 현재 대기중인 것 확인
    const waiting = await db.execute("SELECT COUNT(*) as cnt FROM keywords WHERE is_expanded = 0");
    console.log(`Before: ${waiting.rows[0].cnt}waiting`);

    // 2. 검색량 500 이상인 완료된 키워드를 다시 대기 상태로 변경 (재활용)
    // 2.6만 개 중 상위권 키워드를 시드로 다시 쓰겟다는 전략
    const result = await db.execute(`
        UPDATE keywords 
        SET is_expanded = 0, updated_at = datetime('now') 
        WHERE is_expanded = 1 
          AND total_search_cnt >= 500
    `);

    console.log(`✅ Reset ${result.rowsAffected} keywords to 'waiting' status.`);

    // 3. 결과 확인
    const waitingAfter = await db.execute("SELECT COUNT(*) as cnt FROM keywords WHERE is_expanded = 0");
    console.log(`After: ${waitingAfter.rows[0].cnt} waiting`);
}

forceReexpand();
