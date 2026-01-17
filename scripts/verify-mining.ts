
import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    const db = getTursoClient();
    try {
        console.log('--- Verification Stats ---');

        const total = await db.execute('SELECT COUNT(*) as count FROM keywords');
        console.log(`Total keywords now: ${total.rows[0].count}`);

        const recent = await db.execute('SELECT keyword, created_at, updated_at FROM keywords WHERE keyword IN ("돈까스", "강남역맛집", "시금치무침", "치킨")');
        console.log('--- Found Target Keywords ---');
        recent.rows.forEach(r => {
            console.log(`${r.keyword} | Created: ${r.created_at} | Updated: ${r.updated_at}`);
        });

        const newKeywords = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE created_at > datetime("now", "-10 minutes")');
        console.log(`New keywords in last 10 mins: ${newKeywords.rows[0].count}`);

    } catch (e) {
        console.error('Error:', e);
    }
}

verify();
