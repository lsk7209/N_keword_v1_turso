import { fetchDocumentCount } from './src/utils/naver-api';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugFillOne() {
    const keyword = '다이어트'; // One of the seeds
    console.log(`Attempting to fetch docs for '${keyword}'...`);

    try {
        const start = Date.now();
        const result = await fetchDocumentCount(keyword);
        console.log('SUCCESS:', result);
        console.log(`Time: ${Date.now() - start}ms`);
    } catch (e: any) {
        console.error('FAILURE:', e);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        } else if (e.message) {
            console.error('Message:', e.message);
        }
    }
}

debugFillOne();
