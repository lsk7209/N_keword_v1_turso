
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT is_expanded as exp, updated_at as up FROM keywords WHERE keyword = "치킨"');
    if (result.rows.length === 0) console.log('MISSING');
    else console.log('EXP:' + result.rows[0].exp + ', UP:' + result.rows[0].up);
}
check();
