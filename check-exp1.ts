
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1');
    console.log('EXP1:' + result.rows[0].count);
}
check();
