import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { runMiningBatch } from '@/utils/batch-runner';

async function main() {
    console.log('🧪 Verifying Optimization Logic...');

    // Run a tiny batch to trigger Auto-Healing and Bloom check
    await runMiningBatch({
        task: 'expand',
        mode: 'TURBO',
        expandBatch: 5,
        expandConcurrency: 1,
        maxRunMs: 10000
    });

    console.log('✅ Verification Run Completed.');
}

main().catch(console.error);
