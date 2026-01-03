import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkDocsCount() {
    const db = getTursoClient();

    console.log('Checking actual document count in DB...');

    const result = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE total_doc_cnt IS NOT NULL
        AND total_doc_cnt >= 0
    `);

    console.log(`ACTUAL Keywords with Doc Count: ${result.rows[0].count}`);

    const recent = await db.execute(`
        SELECT COUNT(*) as count
        FROM keywords
        WHERE total_doc_cnt IS NOT NULL
        AND updated_at > datetime('now', '-24 hours')
    `);

    console.log(`RECENTLY Updated with Doc Count (24h): ${recent.rows[0].count}`);
}

checkDocsCount();
