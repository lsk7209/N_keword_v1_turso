
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { processSeedKeyword, bulkDeferredInsert } from '../src/utils/mining-engine';

async function debugSeed() {
    const seed = '유튜브'; // 인기 키워드 (이미 많이 캤을 것)
    console.log(`🔎 Debugging Seed: ${seed}`);

    // 1. Process
    // skipDocFetch=true (Expand mode)
    const result = await processSeedKeyword(seed, 0, true, 100);

    console.log(`📦 Process Result: ${result.items.length} candidates found`);

    // 2. Insert (Simulation)
    if (result.items.length > 0) {
        console.log('💾 Triggering bulkDeferredInsert...');
        await bulkDeferredInsert(result.items);
    } else {
        console.log('⚠️ No items to insert');
    }
}
debugSeed();
