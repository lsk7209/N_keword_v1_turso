import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runMiningBatch } from '@/utils/batch-runner';

async function simulateGithubAction() {
    console.log('=== Simulating GitHub Actions Cron ===');
    console.log('Task: expand');
    console.log('Mode: TURBO');
    console.log('Parameters: expandBatch=200, expandConcurrency=30, minSearchVolume=100');
    console.log('');

    try {
        const result = await runMiningBatch({
            task: 'expand',
            expandBatch: 200,
            expandConcurrency: 30,
            minSearchVolume: 100,
            maxRunMs: 58000
        });

        console.log('');
        console.log('=== RESULT ===');
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('ERROR:', e);
    }
}

simulateGithubAction();
