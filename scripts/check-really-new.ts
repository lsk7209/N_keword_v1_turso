
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function checkNew() {
    const db = getTursoClient();

    // 최근 5분 내 새로 생성된 키워드 (INSERT 된 것)
    const res = await db.execute("SELECT COUNT(*) as new_keywords FROM keywords WHERE created_at > datetime('now', '-5 minutes')");

    // 최근 5분 내 업데이트된 키워드 (UPDATE 된 것)
    const res2 = await db.execute("SELECT COUNT(*) as updated_keywords FROM keywords WHERE updated_at > datetime('now', '-5 minutes')");

    console.log('🆕 NEW KEYWORDS (created_at):', res.rows[0].new_keywords);
    console.log('🔄 UPDATED KEYWORDS (updated_at):', res2.rows[0].updated_keywords);
}
checkNew();
