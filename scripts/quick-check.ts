
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function check() {
    const db = getTursoClient();

    // is_expanded 분포
    const exp = await db.execute("SELECT is_expanded, COUNT(*) as c FROM keywords GROUP BY is_expanded");
    console.log('is_expanded:', JSON.stringify(exp.rows));

    // total_doc_cnt 상태
    const doc = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NULL");
    console.log('total_doc_cnt IS NULL:', doc.rows[0].c);

    // 최근 5분 업데이트
    const recent = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE updated_at > datetime('now', '-5 minutes')");
    console.log('Recent 5m updates:', recent.rows[0].c);
}
check();
