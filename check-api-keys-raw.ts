
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('=== API KEY CHECK ===');
console.log('AD_KEYS:', process.env.NAVER_AD_API_KEYS ? 'SET (length: ' + process.env.NAVER_AD_API_KEYS.length + ')' : 'NOT SET');
console.log('SEARCH_KEYS:', process.env.NAVER_SEARCH_API_KEYS ? 'SET (length: ' + process.env.NAVER_SEARCH_API_KEYS.length + ')' : 'NOT SET');

// Check if they're valid JSON arrays
if (process.env.NAVER_AD_API_KEYS) {
    try {
        const keys = JSON.parse(process.env.NAVER_AD_API_KEYS);
        console.log('AD_KEYS_COUNT:', Array.isArray(keys) ? keys.length : 'NOT_ARRAY');
    } catch (e) {
        console.log('AD_KEYS_PARSE_ERROR:', (e as Error).message);
    }
}

if (process.env.NAVER_SEARCH_API_KEYS) {
    try {
        const keys = JSON.parse(process.env.NAVER_SEARCH_API_KEYS);
        console.log('SEARCH_KEYS_COUNT:', Array.isArray(keys) ? keys.length : 'NOT_ARRAY');
    } catch (e) {
        console.log('SEARCH_KEYS_PARSE_ERROR:', (e as Error).message);
    }
}
