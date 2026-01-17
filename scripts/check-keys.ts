
import { keyManager } from '@/utils/key-manager';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function checkKeys() {
    console.log('--- API Key Status ---');

    const adStatus = keyManager.getStatusSummary('AD');
    const searchStatus = keyManager.getStatusSummary('SEARCH');

    console.log('AD Keys:', adStatus);
    console.log('SEARCH Keys:', searchStatus);

    console.log('NAVER_AD_API_KEYS length:', process.env.NAVER_AD_API_KEYS?.length || 0);
    console.log('NAVER_SEARCH_API_KEYS length:', process.env.NAVER_SEARCH_API_KEYS?.length || 0);
}

checkKeys();
