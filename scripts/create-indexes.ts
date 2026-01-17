import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { getTursoClient } from '@/utils/turso';

async function createIndexes() {
    const db = getTursoClient();
    console.log('🚀 Creating Indexes for Performance Optimization...');

    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_is_expanded_search ON keywords(is_expanded, total_search_cnt DESC);",
        "CREATE INDEX IF NOT EXISTS idx_doc_cnt_search ON keywords(total_doc_cnt, total_search_cnt DESC);",
        "CREATE INDEX IF NOT EXISTS idx_tier ON keywords(tier) WHERE tier IS NOT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_created_at ON keywords(created_at DESC);"
    ];

    for (const sql of indexes) {
        try {
            console.log(`Executing: ${sql}`);
            await db.execute(sql);
            console.log('✅ Success');
        } catch (e: any) {
            console.error(`❌ Failed: ${e.message}`);
        }
    }
    console.log('🏁 Indexing Completed.');
}

createIndexes().catch(console.error);
