
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function run() {
    try {
        const db = getTursoClient();
        const res = await db.execute(`
            SELECT 
                SUM(CASE WHEN is_expanded = 0 THEN 1 ELSE 0 END) as unexpanded,
                SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as expanded,
                SUM(CASE WHEN is_expanded = 2 THEN 1 ELSE 0 END) as processing
            FROM keywords
        `);
        console.log('STATS:', JSON.stringify(res.rows[0]));
    } catch (e) {
        console.error(e);
    }
}
run();
