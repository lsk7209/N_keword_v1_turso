
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    const db = getTursoClient();
    try {
        const total = await db.execute('SELECT COUNT(*) as count FROM keywords');
        const count10m = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE created_at > datetime("now", "-10 minutes")');
        const target = await db.execute('SELECT keyword, updated_at FROM keywords WHERE keyword IN ("치킨", "돈까스", "강남역맛집")');

        console.log('TOTAL_COUNT: ' + total.rows[0].count);
        console.log('RECENT_10M: ' + count10m.rows[0].count);
        target.rows.forEach(r => console.log('KEYWORD: ' + r.keyword + ' | UPDATED: ' + r.updated_at));

    } catch (e: any) {
        console.error('Error: ' + e.message);
    }
}

verify();
