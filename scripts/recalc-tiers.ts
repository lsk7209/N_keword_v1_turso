import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { getTursoClient } from '@/utils/turso';

async function recalcTiers() {
    const db = getTursoClient();
    console.log('🔄 Recalculating Tiers for all analyzed keywords...');

    // 1. Fetch analyzed but potentially unranked or needing update
    // Fetching 10000 at a time to be safe with memory
    const BATCH_SIZE = 10000;

    // Get total count first
    const countRes = await db.execute("SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NOT NULL");
    const total = countRes.rows[0].count as number;
    console.log(`found ${total} analyzed keywords.`);

    let processed = 0;
    let updatedCount = 0;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const rows = await db.execute({
            sql: `SELECT id, keyword, total_search_cnt, blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, total_doc_cnt 
                  FROM keywords 
                  WHERE total_doc_cnt IS NOT NULL 
                  LIMIT ? OFFSET ?`,
            args: [BATCH_SIZE, offset]
        });

        const updates = [];

        for (const row of rows.rows) {
            const searchCnt = Number(row.total_search_cnt);
            const viewDocCnt = (Number(row.blog_doc_cnt) || 0) + (Number(row.cafe_doc_cnt) || 0) + (Number(row.web_doc_cnt) || 0);

            let ratio = 0;
            let tier = 'BRONZE'; // Default low

            if (viewDocCnt > 0) {
                ratio = searchCnt / viewDocCnt;
                if (viewDocCnt <= 100 && ratio > 5) tier = 'PLATINUM';
                else if (ratio > 10) tier = 'PLATINUM';
                else if (ratio > 5) tier = 'GOLD';
                else if (ratio > 1) tier = 'SILVER';
                else tier = 'BRONZE';
            } else if (searchCnt > 0) {
                // No documents found but has search volume -> Great opportunity
                tier = 'PLATINUM';
                ratio = 99.99;
            } else {
                tier = 'UNRANKED'; // No search volume?
            }

            // Prepare update statement
            updates.push({
                sql: "UPDATE keywords SET tier = ?, golden_ratio = ? WHERE id = ?",
                args: [tier, ratio, row.id]
            });
        }

        if (updates.length > 0) {
            await db.batch(updates);
            updatedCount += updates.length;
        }

        processed += rows.rows.length;
        console.log(`   Processed ${processed} / ${total}...`);
    }

    console.log(`✅ Tier Recalculation Complete. Updated ${updatedCount} rows.`);
}

recalcTiers().catch(console.error);
