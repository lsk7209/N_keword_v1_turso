
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    try {
        console.log('--- Database Stats ---');

        const total = await db.execute('SELECT COUNT(*) as count FROM keywords');
        console.log(`Total keywords: ${total.rows[0].count}`);

        const expanded0 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0');
        console.log(`is_expanded = 0 (All): ${expanded0.rows[0].count}`);

        const expanded0_vol100 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 100');
        console.log(`is_expanded = 0 AND vol >= 100: ${expanded0_vol100.rows[0].count}`);

        const expanded0_vol1000 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 1000');
        console.log(`is_expanded = 0 AND vol >= 1000: ${expanded0_vol1000.rows[0].count}`);

        const expanded1 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1');
        console.log(`is_expanded = 1: ${expanded1.rows[0].count}`);

        const expanded2 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2');
        console.log(`is_expanded = 2 (In Progress): ${expanded2.rows[0].count}`);

        const docNull = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NULL');
        console.log(`total_doc_cnt IS NULL: ${docNull.rows[0].count}`);

        const mode = await db.execute("SELECT value FROM settings WHERE key = 'mining_mode'");
        console.log(`Mining Mode: ${mode.rows[0]?.value || 'TURBO (default)'}`);

        const recent = await db.execute('SELECT keyword, updated_at FROM keywords ORDER BY updated_at DESC LIMIT 5');
        console.log('--- Recent Updates ---');
        recent.rows.forEach(r => console.log(`${r.keyword} (${r.updated_at})`));

    } catch (e) {
        console.error('Error:', e);
    }
}

check();
