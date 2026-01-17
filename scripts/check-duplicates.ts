import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkDuplicates() {
    const db = getTursoClient();

    console.log('Checking for duplicate keywords...');

    const res = await db.execute(`
        SELECT keyword, COUNT(*) as c
        FROM keywords
        GROUP BY keyword
        HAVING c > 1
        LIMIT 10
    `);

    if (res.rows.length === 0) {
        console.log('✅ No duplicates found.');
    } else {
        console.log('❌ DUPLICATES FOUND:');
        res.rows.forEach(r => console.log(`${r.keyword}: ${r.c}`));
    }
}

checkDuplicates();
