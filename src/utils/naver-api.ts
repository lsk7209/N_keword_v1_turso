
import { keyManager } from './key-manager';

// Web Crypto HMAC helper
async function generateSignature(timestamp: string, method: string, uri: string, secretKey: string) {
    const message = `${timestamp}.${method}.${uri}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const msgData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, msgData);
    // Convert buffer to base64
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function fetchRelatedKeywords(seed: string) {
    const key = keyManager.getNextKey('AD');
    const { accessKey, secretKey, customerId } = key.parsed; // customerId might be needed for header, but usually just Access/Secret/Signature for auth.
    // Naver Ad API "RelKwdStat"
    // URI: /keywordstool
    // Base: https://api.naver.com

    // NOTE: Real Naver Ad API requires Customer ID in header 'X-Customer' usually? 
    // Checking docs (mental model): Headers are X-Timestamp, X-API-KEY, X-Customer, X-Signature.
    // If customerId is missing from env, this might fail. We assume user provides strict "Access:Secret:Customer" or we handle error.

    const timestamp = Date.now().toString();
    const method = 'GET';
    const uri = '/keywordstool';

    if (!accessKey || !secretKey) throw new Error('Invalid Ad Key');

    const signature = await generateSignature(timestamp, method, uri, secretKey);

    const params = new URLSearchParams();
    params.append('hintKeywords', seed);
    params.append('showDetail', '1');

    const url = `https://api.naver.com${uri}?${params.toString()}`;

    const headers: Record<string, string> = {
        'X-Timestamp': timestamp,
        'X-API-KEY': accessKey,
        'X-Signature': signature,
    };

    if (customerId) {
        headers['X-Customer'] = customerId;
    }

    try {
        const response = await fetch(url, { headers });
        if (response.status === 429) {
            keyManager.report429(key.id, 'AD');
            throw new Error('RateLimit');
        }
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ad API Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        // data.keywordList is the array
        // Each item: { relKeyword, monthlyPcQcCnt, monthlyMobileQcCnt, ... }
        return data.keywordList || [];
    } catch (e) {
        throw e;
    }
}

export async function fetchDocumentCount(keyword: string) {
    // Uses Search API (Blog, Cafe, etc)
    // We need 4 counts: Blog, Cafe, Web(Website), News (?)
    // API Limits: Search API is usually generous but we have rate limits.
    // We can do parallel calls for Blog/Cafe/etc or sequential.
    // Since we have 9 keys, and we want speed, we can parallelize types.

    const types = ['blog', 'cafearticle', 'webkr', 'news'] as const;

    // We pick ONE key for all 4 calls to ensure consistency or pick multiple?
    // Using one key is safer to avoid 'partial' failure spread across keys.
    const key = keyManager.getNextKey('SEARCH');
    const { clientId, clientSecret } = key.parsed;

    if (!clientId || !clientSecret) throw new Error('Invalid Search Key');

    const headers = {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
    };

    // Helper for single type
    const fetchType = async (type: typeof types[number]) => {
        // q=keyword, display=1
        // URL: https://openapi.naver.com/v1/search/{type}?query={keyword}&display=1
        // Note: webkr might be v1/search/webkr
        const url = `https://openapi.naver.com/v1/search/${type}?query=${encodeURIComponent(keyword)}&display=1&sort=sim`; // sort doesn't matter for count 'total'

        const res = await fetch(url, { headers });
        if (res.status === 429) {
            keyManager.report429(key.id, 'SEARCH');
            throw new Error('RateLimit');
        }
        if (!res.ok) throw new Error(`Search API ${type} error`);

        const json = await res.json();
        return json.total || 0;
    };

    try {
        const results = await Promise.all([
            fetchType('blog'),
            fetchType('cafearticle'),
            fetchType('webkr'),
            fetchType('news')
        ]);

        return {
            blog: results[0],
            cafe: results[1],
            web: results[2],
            news: results[3],
            total: results[0] + results[1] + results[2] + results[3] // rough total
        };
    } catch (e) {
        throw e;
    }
}
