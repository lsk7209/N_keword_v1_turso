
import { getTursoClient, generateUUID } from '../src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function fixMissingIds() {
    const db = getTursoClient();

    console.log('--- Fixing Missing IDs in Keywords Table ---');

    // 1. Fetch keywords with NULL ID
    const orphans = await db.execute('SELECT keyword FROM keywords WHERE id IS NULL');
    console.log(`Found ${orphans.rows.length} keywords with NULL ID.`);

    if (orphans.rows.length === 0) {
        console.log('No work to do.');
        return;
    }

    // 2. Update in batches
    const BATCH_SIZE = 100;
    const total = orphans.rows.length;
    let processed = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = orphans.rows.slice(i, i + BATCH_SIZE);
        const statements = batch.map(row => ({
            sql: 'UPDATE keywords SET id = ? WHERE keyword = ? AND id IS NULL',
            args: [generateUUID(), row.keyword as string]
        }));

        try {
            await db.batch(statements);
            processed += batch.length;
            if (processed % 1000 === 0 || processed === total) {
                console.log(`Progress: ${processed}/${total} fixed...`);
            }
        } catch (e: any) {
            console.error(`Batch failed at offset ${i}:`, e.message);
        }
    }

    console.log(`\n🎉 Successfully populated IDs for ${processed} keywords.`);
}

fixMissingIds().catch(console.error);
