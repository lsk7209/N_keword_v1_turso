
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function checkRecent() {
    const db = getTursoClient();
    const res = await db.execute(`
        SELECT keyword, is_expanded, created_at, total_search_cnt 
        FROM keywords 
        ORDER BY created_at DESC 
        LIMIT 20
    `);
    console.log(JSON.stringify(res.rows, null, 2));
}
checkRecent();
