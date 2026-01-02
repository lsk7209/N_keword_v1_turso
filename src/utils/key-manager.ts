
type KeyType = 'AD' | 'SEARCH';

interface KeyConfig {
    id: string; // The full key string from env
    parsed: {
        // Ad API: accessKey, secretKey, (customerId?)
        // Search API: clientId, clientSecret
        accessKey?: string;
        secretKey?: string;
        customerId?: string;
        clientId?: string;
        clientSecret?: string;
    };
    cooldownUntil: number; // Timestamp
}

class KeyManager {
    private adKeys: KeyConfig[] = [];
    private searchKeys: KeyConfig[] = [];

    private adIndex = 0;
    private searchIndex = 0;

    constructor() {
        // Delayed loading to support dotenv.config() in scripts
    }

    private ensureLoaded() {
        if (this.adKeys.length === 0 && this.searchKeys.length === 0) {
            this.loadKeys();
        }
    }

    private loadKeys() {
        // Support both old and new variable names
        const adEnv = process.env.NAVER_AD_API_KEYS || process.env.NAVER_AD_KEYS;
        const searchEnv = process.env.NAVER_SEARCH_API_KEYS || process.env.NAVER_SEARCH_KEYS;

        if (adEnv) {
            try {
                const raw = JSON.parse(adEnv);
                if (Array.isArray(raw)) {
                    this.adKeys = raw.map((k: any) => {
                        // Handle Object format: { key, secret, cust }
                        if (typeof k === 'object' && k.key) {
                            return {
                                id: k.key.trim(),
                                parsed: {
                                    accessKey: k.key.trim(),
                                    secretKey: k.secret ? k.secret.trim() : '',
                                    customerId: k.cust ? k.cust.trim() : ''
                                },
                                cooldownUntil: 0
                            };
                        }
                        return null;
                    }).filter(Boolean) as KeyConfig[];
                }
            } catch (e) {
                console.error("Failed to parse NAVER_AD_KEYS", e);
            }
        }

        if (searchEnv) {
            try {
                const raw = JSON.parse(searchEnv);
                if (Array.isArray(raw)) {
                    this.searchKeys = raw.map((k: any) => {
                        // Handle Object format: { id, secret }
                        if (typeof k === 'object' && k.id) {
                            return {
                                id: k.id,
                                parsed: {
                                    clientId: k.id,
                                    clientSecret: k.secret
                                },
                                cooldownUntil: 0
                            };
                        }
                        // Handle String format: "id:secret"
                        if (typeof k === 'string') {
                            const parts = k.split(':');
                            return {
                                id: k,
                                parsed: {
                                    clientId: parts[0],
                                    clientSecret: parts[1]
                                },
                                cooldownUntil: 0
                            };
                        }
                        return null;
                    }).filter(Boolean) as KeyConfig[];
                }
            } catch (e) {
                console.error("Failed to parse NAVER_SEARCH_KEYS", e);
            }
        }

        // Randomize start index to distribute load
        if (this.adKeys.length > 0) {
            this.adIndex = Math.floor(Math.random() * this.adKeys.length);
        }
        if (this.searchKeys.length > 0) {
            this.searchIndex = Math.floor(Math.random() * this.searchKeys.length);
        }
    }

    public getNextKey(type: KeyType): KeyConfig {
        this.ensureLoaded();
        const keys = type === 'AD' ? this.adKeys : this.searchKeys;
        if (keys.length === 0) throw new Error(`No ${type} keys available`);

        let attempts = 0;
        while (attempts < keys.length) {
            const currentIndex = type === 'AD' ? this.adIndex : this.searchIndex;
            const key = keys[currentIndex];

            // Advance index for next call (Round Robin)
            if (type === 'AD') {
                this.adIndex = (this.adIndex + 1) % keys.length;
            } else {
                this.searchIndex = (this.searchIndex + 1) % keys.length;
            }

            if (key.cooldownUntil > Date.now()) {
                attempts++;
                continue;
            }

            return key;
        }

        throw new Error(`All ${type} keys are rate limited or in cooldown`);
    }

    public report429(keyId: string, type: KeyType) {
        const keys = type === 'AD' ? this.adKeys : this.searchKeys;
        const key = keys.find(k => k.id === keyId);
        if (key) {
            // Cooldown for 2 minutes? Or random?
            // User said "Apply cooldown". I'll do 60 seconds to be safe.
            key.cooldownUntil = Date.now() + 60 * 1000;
            console.warn(`Key ${keyId.substring(0, 5)}... marked for cooldown (429)`);
        }
    }

    public getStatusSummary(type: KeyType) {
        this.ensureLoaded();
        const keys = type === 'AD' ? this.adKeys : this.searchKeys;
        const now = Date.now();
        const total = keys.length;
        const cooling = keys.filter(k => k.cooldownUntil > now).length;
        const available = total - cooling;
        const nextReadyInMs = cooling === 0
            ? 0
            : Math.max(0, Math.min(...keys.filter(k => k.cooldownUntil > now).map(k => k.cooldownUntil - now)));

        return {
            total,
            available,
            cooling,
            nextReadyInMs
        };
    }

    public getKeyCount(type: KeyType): number {
        this.ensureLoaded();
        return type === 'AD' ? this.adKeys.length : this.searchKeys.length;
    }
}

// Singleton instance for the duration of the serverless function execution
export const keyManager = new KeyManager();
