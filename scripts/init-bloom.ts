
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getTursoClient } from '../src/utils/turso';
import { BloomFilter } from '../src/utils/bloom-filter';
import { BloomManager } from '../src/utils/bloom-manager';

async function initBloom() {
    const db = getTursoClient();
    console.log('[InitBloom] Fetching all existing keywords...');

    // 키워드 개수 확인
    const countRes = await db.execute("SELECT count(*) as count FROM keywords");
    const totalCount = Number(countRes.rows[0].count);
    console.log(`[InitBloom] Total keywords to process: ${totalCount}`);

    const bloom = new BloomFilter(1024 * 1024); // 1MB filter

    let processed = 0;
    const CHUNK = 10000;

    for (let i = 0; i < totalCount; i += CHUNK) {
        const rows = await db.execute({
            sql: "SELECT keyword FROM keywords LIMIT ? OFFSET ?",
            args: [CHUNK, i]
        });

        rows.rows.forEach(row => {
            bloom.add(row.keyword as string);
        });

        processed += rows.rows.length;
        console.log(`[InitBloom] Processed ${processed}/${totalCount}...`);
    }

    console.log('[InitBloom] Saving Bloom Filter to DB...');
    await BloomManager.saveFilter(bloom);
    console.log('[InitBloom] Done! Massive Row Read savings await.');
}

initBloom().catch(console.error);
