import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { getTursoClient } from '@/utils/turso';

async function verifyCounts() {
    const db = getTursoClient();
    console.log('🕵️ Verifying Keyword Counts...');

    // 1. Total Keywords
    const totalRes = await db.execute("SELECT COUNT(*) as c FROM keywords");
    const total = Number(totalRes.rows[0].c);
    console.log(`Total Keywords in DB: ${total}`);

    // 2. Keywords with Volume < 100
    const lowVolRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE total_search_cnt < 100");
    const lowVol = Number(lowVolRes.rows[0].c);
    console.log(`Keywords with Volume < 100: ${lowVol}`);

    // 3. Keywords with Volume >= 100 (The "Seed" Candidates)
    const seedCandRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE total_search_cnt >= 100");
    const seedCand = Number(seedCandRes.rows[0].c);
    console.log(`Keywords with Volume >= 100: ${seedCand}`);

    // 4. is_expanded Distribution (for Seed Candidates)
    const distRes = await db.execute(`
        SELECT is_expanded, COUNT(*) as c 
        FROM keywords 
        WHERE total_search_cnt >= 100 
        GROUP BY is_expanded
    `);

    console.log('--- Distribution (Volume >= 100) ---');
    let calculatedTotal = 0;
    for (const row of distRes.rows) {
        const count = Number(row.c);
        const status = Number(row.is_expanded);
        let label = 'Unknown';
        if (status === 0) label = 'Pending (0)';
        if (status === 1) label = 'Expanded (1)';
        if (status === 2) label = 'Processing (2)';

        console.log(`${label}: ${count}`);
        calculatedTotal += count;
    }
    console.log(`Sum of Distribution: ${calculatedTotal}`);

    if (total !== seedCand) {
        console.warn(`⚠️ Mismatch: Total (${total}) != Volume>=100 (${seedCand}). There are hidden low-volume keywords!`);
    } else {
        console.log(`✅ All keywords match the seed volume criteria.`);
    }

    if (calculatedTotal !== seedCand) {
        console.warn(`⚠️ Mismatch: Sum of parts (${calculatedTotal}) != Total Seeds (${seedCand})`);
    } else {
        console.log(`✅ Math works: Sum of parts equals total.`);
    }
}

verifyCounts().catch(console.error);
