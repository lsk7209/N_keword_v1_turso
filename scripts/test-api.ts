
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { processSeedKeyword } from '@/utils/mining-engine';

async function checkApi() {
    console.log('🔍 Checking Naver API availability...');
    try {
        const result = await processSeedKeyword('테스트', 30, true, 100);
        console.log(`✅ API OK! Found ${result.items.length} keywords.`);
    } catch (e: any) {
        console.error('❌ API Error (Possible Block):', e.message);
    }
}
checkApi();
