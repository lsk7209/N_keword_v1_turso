
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT keyword, created_at FROM keywords ORDER BY created_at DESC LIMIT 5');
    console.log(JSON.stringify(result.rows, null, 2));
}
check();
