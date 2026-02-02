
// Standalone script to verify Naver API response for related keywords
// avoids module resolution issues by including necessary logic directly.

const crypto = require('crypto');
const https = require('https');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.error('❌ .env.local not found at', envPath);
    process.exit(1);
}

// Mock KeyManager logic
function getAdKeys() {
    const adEnv = process.env.NAVER_AD_API_KEYS || process.env.NAVER_AD_KEYS;
    console.log(`[DEBUG] Raw Env Length: ${adEnv ? adEnv.length : 'undefined'}`);
    if (!adEnv) return [];
    try {
        const raw = JSON.parse(adEnv);
        if (Array.isArray(raw)) {
            return raw.map(k => {
                if (typeof k === 'object' && k.key) {
                    return {
                        accessKey: k.key.trim(),
                        secretKey: k.secret ? k.secret.trim() : '',
                        customerId: k.cust ? k.cust.trim() : ''
                    };
                }
                return null;
            }).filter(Boolean);
        }
    } catch (e) {
        console.error("Failed to parse NAVER_AD_KEYS", e);
    }
    return [];
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function generateSignature(timestamp, method, uri, secretKey) {
    const message = `${timestamp}.${method}.${uri}`;
    return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

async function fetchRelatedKeywords(seed) {
    const keys = getAdKeys();
    if (keys.length === 0) throw new Error('No Ad Keys found');

    console.log(`🔑 Loaded ${keys.length} Ad Keys.`);

    // Use random key
    const key = keys[Math.floor(Math.random() * keys.length)];
    const { accessKey, secretKey, customerId } = key;

    const timestamp = Date.now().toString();
    const uri = '/keywordstool';
    const signature = await generateSignature(timestamp, 'GET', uri, secretKey);

    // Construct URL with hintKeywords
    const url = `https://api.naver.com${uri}?hintKeywords=${encodeURIComponent(seed)}&showDetail=1`;

    console.log(`📡 Fetching: ${url}`);

    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'X-Timestamp': timestamp,
                'X-API-KEY': accessKey,
                'X-Signature': signature,
                'X-Customer': customerId
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`API Error ${res.statusCode}: ${data}`));
                } else {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.keywordList || []);
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function run() {
    const keyword = '나이키운동화';
    console.log(`\n🔍 Verifying related keywords for: "${keyword}"`);

    try {
        const results = await fetchRelatedKeywords(keyword);
        console.log(`✅ Received ${results.length} related keywords.`);

        console.log('\n📊 Top 10 Keywords returned:');
        results.slice(0, 10).forEach((item, idx) => {
            console.log(`${idx + 1}. ${item.relKeyword} (Search: ${item.monthlyPcQcCnt + item.monthlyMobileQcCnt})`);
        });

        const weirdKeywords = ['1월달력', '강남맛집체험단', '12월달력', '인천공항주차장'];
        const found = results.filter(k => weirdKeywords.includes(k.relKeyword.replace(/\s+/g, '')));

        if (found.length > 0) {
            console.error('\n⚠️  SUSPICIOUS RESULTS DETECTED!');
            console.error('Found unrelated keywords:', found.map(k => k.relKeyword));
            console.error('❌ It seems the API is ignoring the hint keyword or returning generic popular keywords.');
        } else {
            console.log('\n✅ No suspicious keywords found. Relevance seems OK.');
        }

    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}

run();
