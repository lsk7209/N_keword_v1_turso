import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check24h() {
    const db = getTursoClient();
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        console.log('Since time (24h ago):', since);

        const r = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE created_at >= ?',
            args: [since]
        });
        console.log('Keywords created in last 24h:', r.rows[0].count);

        const latest = await db.execute('SELECT created_at, keyword FROM keywords ORDER BY created_at DESC LIMIT 10');
        console.log('\nLatest 10 keywords:');
        latest.rows.forEach((row, i) => {
            console.log(`${i + 1}. ${row.keyword} at ${row.created_at}`);
        });
    } catch (e) {
        console.error(e);
    }
}

check24h();
