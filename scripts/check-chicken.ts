
import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT keyword, is_expanded, updated_at FROM keywords WHERE keyword = "치킨"');
    console.log(JSON.stringify(result.rows, null, 2));
}
check();
