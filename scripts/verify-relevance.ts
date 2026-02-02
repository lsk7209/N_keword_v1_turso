
import { processSeedKeyword } from '../src/utils/mining-engine';
import { fetchRelatedKeywords } from '../src/utils/naver-api';
import { keyManager } from '../src/utils/key-manager';

// Force load keys
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    console.log('🔍 Testing "나이키운동화" related keywords...');

    try {
        // 1. Direct API Check
        const directResults = await fetchRelatedKeywords('나이키운동화');
        console.log(`✅ Direct API returned ${directResults.length} keywords.`);
        console.log('Top 5 keywords:', directResults.slice(0, 5).map((k: any) => k.relKeyword));

        // Check for specific "weird" keywords user mentioned
        const weirdKeywords = ['1월달력', '강남맛집체험단', '12월달력', '인천공항주차장'];
        const foundWeird = directResults.filter((k: any) => weirdKeywords.includes(k.relKeyword.replace(/\s+/g, '')));

        if (foundWeird.length > 0) {
            console.warn('⚠️ Found weird keywords in API response:', foundWeird.map((k: any) => k.relKeyword));
        } else {
            console.log('✅ No weird keywords found in direct API response.');
        }

        // 2. Mining Engine Check (Simulate processing)
        console.log('\n🚀 Testing processSeedKeyword...');
        const result = await processSeedKeyword('나이키운동화', 0, true, 20); // Skip doc fetch for speed

        console.log(`✅ Processed ${result.items.length} items.`);
        const topItems = result.items.slice(0, 5);
        console.log('Top 5 Items:', topItems.map(i => `${i.keyword} (${i.total_search_cnt})`));

        const foundWeirdInItems = result.items.filter(i => weirdKeywords.includes(i.keyword));
        if (foundWeirdInItems.length > 0) {
            console.warn('⚠️ Found weird keywords in Mining Result:', foundWeirdInItems.map(i => i.keyword));
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
}

verify();
