
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function check() {
    const db = getTursoClient();
    const res = await db.execute("SELECT keyword, is_expanded, updated_at FROM keywords WHERE updated_at > datetime('now', '-5 minutes') LIMIT 20");
    console.log(JSON.stringify(res.rows, null, 2));
}
check();
