
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT keyword, created_at, updated_at FROM keywords WHERE keyword IN ("쿠시카츠", "아라치치킨", "멘치카츠", "치킨")');
    console.log(JSON.stringify(result.rows, null, 2));
}
check();
