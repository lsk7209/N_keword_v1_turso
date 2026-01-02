import { runMiningBatch } from './src/utils/batch-runner';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testBatch() {
    console.log('Testing mining batch...');
    try {
        const result = await runMiningBatch({
            task: 'expand',
            expandBatch: 10,
            expandConcurrency: 2,
            minSearchVolume: 100,
            maxRunMs: 30000
        });
        console.log('\nResult:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

testBatch();
