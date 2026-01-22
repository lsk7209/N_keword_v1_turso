import { getTursoClient } from '../src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkStatusDetailed() {
    const db = getTursoClient();

    console.log('Checking Detailed Status...');

    const res = await db.execute(`
        SELECT 
            COUNT(*) as total_keywords,
            COUNT(CASE WHEN total_doc_cnt IS NOT NULL THEN 1 END) as doc_filled_count,
            COUNT(CASE WHEN total_doc_cnt IS NULL THEN 1 END) as doc_empty_count,
            COUNT(CASE WHEN is_expanded = 1 THEN 1 END) as expanded_true,
            COUNT(CASE WHEN is_expanded = 0 THEN 1 END) as expanded_false
        FROM keywords
    `);

    console.log('--- DB Stats ---');
    console.log('Total:', res.rows[0].total_keywords);
    console.log('Doc Filled:', res.rows[0].doc_filled_count);
    console.log('Doc Empty:', res.rows[0].doc_empty_count);
    console.log('Expanded Done:', res.rows[0].expanded_true);
    console.log('Expanded Pending:', res.rows[0].expanded_false);

    // Check what the "20" might refer to
    if (Number(res.rows[0].doc_filled_count) === 20) {
        console.log('MATCH: Doc Filled Count is exactly 20.');
    } else {
        console.log(`MISMATCH: Doc Filled Count is ${res.rows[0].doc_filled_count}, not 20.`);
    }
}

checkStatusDetailed();
