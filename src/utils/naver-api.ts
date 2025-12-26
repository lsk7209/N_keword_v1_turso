
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
    console.log(`[NaverAPI] Fetching related keywords for: "${seed}"`);

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

            // 터보모드: 로깅 최소화로 성능 향상
            const response = await fetch(url, { headers });

            if (response.status === 429) {
                keyManager.report429(key.id, 'AD');
                console.warn(`[NaverAPI] Ad Key ${key.id.substring(0, 8)}... rate limited. Retrying with next key...`);
                // 다음 키로 즉시 전환 (cooldown은 이미 설정됨)
                continue; // Try next key immediately
            }

            if (!response.ok) {
                const text = await response.text();
                console.error(`[NaverAPI] Ad API Error ${response.status}: ${text}`);
                // If it's a 4xx error (other than 429), it might be invalid key signature or bad request. 
                // We should probably try another key just in case, unless it's 400 Bad Request (logic error).
                // For safety, let's treat it as key failure and retry.
                console.warn(`[NaverAPI] Retrying with new key...`);
                lastError = new Error(`Ad API Error: ${response.status} - ${text}`);
                continue;
            }

            const data = await response.json();
            const keywordList = data.keywordList || [];

            console.log(`[NaverAPI] Success! Got ${keywordList.length} keywords for "${seed}"`);

            // 샘플 데이터 로깅 (처음 3개만)
            if (keywordList.length > 0 && keywordList.length <= 3) {
                console.log(`[NaverAPI] Sample:`, keywordList.map((k: any) => `${k.relKeyword} (${k.monthlyPcQcCnt}/${k.monthlyMobileQcCnt})`));
            } else if (keywordList.length > 3) {
                console.log(`[NaverAPI] Sample (first 3):`, keywordList.slice(0, 3).map((k: any) => `${k.relKeyword} (${k.monthlyPcQcCnt}/${k.monthlyMobileQcCnt})`));
            }

            return keywordList;

        } catch (e) {
            console.error(`[NaverAPI] Exception on attempt ${i + 1}:`, e);
            lastError = e;
            // 네트워크 오류가 아닌 경우 즉시 다음 키로 전환
            if (e instanceof Error && e.message.includes('No AD keys')) throw e;
            // 짧은 대기 후 다음 키 시도 (네트워크 오류 대비)
            if (i < 2) await sleep(500); // 3번째 시도 전에만 대기
        }
    }

    console.error(`[NaverAPI] Failed after 3 attempts for "${seed}"`);
    throw lastError || new Error('Failed to fetch related keywords');
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
                    'X-Naver-Client-Secret': clientSecret,
                    'Connection': 'keep-alive' // Hint for Keep-Alive
                };

                const url = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(keyword)}&display=1&sort=sim`;

                // 🚀 터보모드: 타임아웃 최적화 (3초 → 2초)로 더 빠른 처리
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

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
