
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const q1 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 100');
    const q2 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 1000');
    const q3 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NULL');

    console.log('EXP0_VOL100: ' + q1.rows[0].count);
    console.log('EXP0_VOL1000: ' + q2.rows[0].count);
    console.log('DOC_NULL: ' + q3.rows[0].count);
}

check();
