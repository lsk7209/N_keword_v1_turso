import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const res = await db.execute("SELECT keyword, total_doc_cnt, updated_at FROM keywords WHERE total_doc_cnt IS NULL LIMIT 1");
    console.log(JSON.stringify(res.rows[0], null, 2));
}

check();
