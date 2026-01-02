
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT keyword, created_at, updated_at FROM keywords WHERE keyword IN ("쿠시카츠", "아라치치킨", "멘치카츠", "치킨")');
    result.rows.forEach(r => console.log(`${r.keyword} | C:${r.created_at} | U:${r.updated_at}`));
}
check();
