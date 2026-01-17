
import { fetchDocumentCount } from '@/utils/naver-api';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugKeyword(keyword: string) {
    console.log(`Testing keyword: ${keyword}`);
    const start = Date.now();
    try {
        const result = await fetchDocumentCount(keyword);
        console.log('Result:', result);
    } catch (e: any) {
        console.error('Failed:', e.message);
    }
    console.log(`Duration: ${Date.now() - start}ms`);
}

debugKeyword('WE호텔제주');
debugKeyword('오간자');
