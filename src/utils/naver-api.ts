
import { keyManager } from './key-manager';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

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
            const uri = '/keywordstool';

            if (!accessKey || !secretKey) throw new Error('Invalid Ad Key');

            const signature = await generateSignature(timestamp, 'GET', uri, secretKey);
            const url = `https://api.naver.com${uri}?hintKeywords=${encodeURIComponent(seed)}&showDetail=1`;

            const headers: Record<string, string> = {
                'X-Timestamp': timestamp,
                'X-API-KEY': accessKey,
                'X-Signature': signature,
            };
            if (customerId) headers['X-Customer'] = customerId;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                keyManager.report429(key.id, 'AD');
                await sleep(500 + Math.random() * 500); // Small jitter backoff
                continue;
            }

            if (!response.ok) {
                const text = await response.text();
                lastError = new Error(`Ad API Error: ${response.status} - ${text}`);
                continue;
            }

            const data = await response.json();
            return data.keywordList || [];

        } catch (e: any) {
            lastError = e;
            if (e.name === 'AbortError') {
                console.warn(`[AdAPI] Timeout for ${seed}, retrying...`);
                // Immediate retry for timeout
                continue;
            }
            if (e instanceof Error && e.message.includes('No AD keys')) throw e;
            if (i < 2) await sleep(300 + Math.random() * 200);
        }
    }
    throw lastError || new Error('Failed to fetch related keywords');
}

export interface DocCounts {
    blog: number;
    cafe: number;
    web: number;
    news: number;
    total: number;
}

export async function fetchDocumentCount(keyword: string): Promise<DocCounts> {


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
                    'X-Naver-Client-Secret': clientSecret,
                    'Connection': 'keep-alive' // Hint for Keep-Alive
                };

                const url = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(keyword)}&display=1&sort=sim`;

                // 🚀 터보모드: 타임아웃 최적화 (2초 → 1.5초)로 더 빠른 처리
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);

                try {
                    const res = await fetch(url, {
                        headers,
                        signal: controller.signal,
                        // @ts-ignore - Next.js/Node fetch might support agent if available, but pure fetch standard doesn't. 
                        // However, 'keep-alive' header helps.
                    });
                    clearTimeout(timeoutId);

                    if (res.status === 429) {
                        keyManager.report429(key.id, 'SEARCH');
                        // Jitter Backoff: 1000ms ~ 2000ms random delay to prevent thundering herd
                        const jitter = 1000 + Math.random() * 1000;
                        await sleep(jitter);
                        continue; // Try next key
                    }

                    if (!res.ok) {
                        continue; // blind retry with next key
                    }

                    const json = await res.json();
                    return json.total || 0;

                } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        // Timeout considered as transient failure, try next key immediately
                        // console.warn(`[NaverAPI] Timeout for ${keyword} (${type})`);
                        continue;
                    }
                    throw fetchError;
                }

            } catch (e: any) {
                lastErr = e;
                // console.error(`[NaverAPI] Key ${key?.id?.slice(0,5)}... fail:`, e.message);
                if (e instanceof Error && e.message.includes('No SEARCH keys')) throw e;
            }
        }
        // If all retries failed, return 0 instead of crashing the whole batch? 
        // Or throw? If we return 0, we might pollute DB with fake 0s. 
        // Throwing is safer for data integrity.
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        throw new Error(`Failed to fetch ${type} count (after 3 retries): ${msg}`);
    };

    // 🚀 OPTIMIZATION: 'news' fetch restored as per user request
    // We fetch blog + cafe + web + news (4 calls per keyword)
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
