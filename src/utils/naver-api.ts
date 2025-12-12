
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
    // Retry up to 3 times with different keys
    let lastError: any;

    for (let i = 0; i < 3; i++) {
        try {
            const key = keyManager.getNextKey('AD');
            const { accessKey, secretKey, customerId } = key.parsed;

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

            const response = await fetch(url, { headers });

            if (response.status === 429) {
                keyManager.report429(key.id, 'AD');
                console.warn(`Ad Key ${key.id} rate limited. Retrying...`);
                continue; // Try next key
            }

            if (!response.ok) {
                const text = await response.text();
                // If it's a 4xx error (other than 429), it might be invalid key signature or bad request. 
                // We should probably try another key just in case, unless it's 400 Bad Request (logic error).
                // For safety, let's treat it as key failure and retry.
                console.warn(`Ad API Error ${response.status}: ${text}. Retrying with new key...`);
                continue;
            }

            const data = await response.json();
            return data.keywordList || [];

        } catch (e) {
            lastError = e;
            console.error(`Attempt ${i + 1} failed for seed ${seed}:`, e);
            // Verify if we should stop strictly? KeyManager throws if NO keys left.
            // If it's a 'No keys' error, break.
            if (e instanceof Error && e.message.includes('No AD keys')) throw e;
        }
    }

    throw lastError || new Error('Failed to fetch related keywords after retries');
}

export async function fetchDocumentCount(keyword: string) {


    type SearchType = 'blog' | 'cafearticle' | 'webkr' | 'news';

    // Helper for single type with retry logic
    const fetchType = async (type: SearchType) => {
        let lastErr;
        // Try up to 3 times to get a valid result using different keys
        for (let i = 0; i < 3; i++) {
            try {
                // Get a FRESH key each attempt (and each type gets its own key flow)
                const key = keyManager.getNextKey('SEARCH');
                const { clientId, clientSecret } = key.parsed;

                if (!clientId || !clientSecret) throw new Error('Invalid Search Key');

                const headers = {
                    'X-Naver-Client-Id': clientId,
                    'X-Naver-Client-Secret': clientSecret
                };

                const url = `https://openapi.naver.com/v1/search/${type}?query=${encodeURIComponent(keyword)}&display=1&sort=sim`;

                const res = await fetch(url, { headers });

                if (res.status === 429) {
                    keyManager.report429(key.id, 'SEARCH');
                    continue; // Try next key
                }

                if (!res.ok) {
                    // console.warn(`Search ${type} error ${res.status} with key ${key.id}. Retrying...`);
                    continue; // blind retry with next key
                }

                const json = await res.json();
                return json.total || 0;

            } catch (e) {
                lastErr = e;
                if (e instanceof Error && e.message.includes('No SEARCH keys')) throw e;
            }
        }
        // If all retries failed, return 0 instead of crashing the whole batch? 
        // Or throw? If we return 0, we might pollute DB with fake 0s. 
        // Throwing is safer for data integrity.
        throw lastErr || new Error(`Failed to fetch ${type} count`);
    };

    try {
        // Parallel execution for maximum speed
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
            total: results[0] + results[1] + results[2] + results[3]
        };
    } catch (e) {
        throw e;
    }
}
