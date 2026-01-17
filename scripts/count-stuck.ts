import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const res = await db.execute("SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt = -2");
    console.log(JSON.stringify(res.rows[0], null, 2));
}

check();
