/**
 * ⚡ Zero-Read Optimization: In-Memory Keyword Cache
 * 
 * Turso Row Reads를 완전히 제거하기 위한 메모리 기반 캐시.
 * 서버 시작 시 단 1회만 DB를 읽고, 이후 모든 중복 검사는 메모리에서만 수행.
 */

import { getTursoClient } from './turso';

export class KeywordCache {
    private static instance: KeywordCache | null = null;
    private cache: Set<string> = new Set();
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): KeywordCache {
        if (!this.instance) {
            this.instance = new KeywordCache();
        }
        return this.instance;
    }

    /**
     * 🚀 초기화: DB에서 모든 키워드를 한 번만 읽어 메모리에 저장
     * - Row Reads: 총 키워드 수만큼 (최초 1회만 발생)
     * - 이후 모든 중복 검사는 Row Reads: 0
     */
    async init(): Promise<void> {
        // 중복 초기화 방지
        if (this.isInitialized) {
            console.log('[KeywordCache] Already initialized');
            return;
        }

        // 동시 호출 방지 (Promise 재사용)
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            const startTime = Date.now();
            const db = getTursoClient();

            console.log('[KeywordCache] 📥 Loading all keywords into memory...');

            try {
                // Pagination으로 메모리 부담 분산
                const CHUNK_SIZE = 50000;
                let offset = 0;
                let totalLoaded = 0;

                while (true) {
                    const result = await db.execute({
                        sql: 'SELECT keyword FROM keywords LIMIT ? OFFSET ?',
                        args: [CHUNK_SIZE, offset]
                    });

                    if (result.rows.length === 0) break;

                    result.rows.forEach(row => {
                        this.cache.add(row.keyword as string);
                    });

                    totalLoaded += result.rows.length;
                    offset += CHUNK_SIZE;

                    if (result.rows.length < CHUNK_SIZE) break;
                }

                this.isInitialized = true;
                const duration = Date.now() - startTime;

                console.log(`[KeywordCache] ✅ Loaded ${totalLoaded.toLocaleString()} keywords in ${duration}ms`);
                console.log(`[KeywordCache] 💾 Memory usage: ~${Math.ceil(totalLoaded * 20 / 1024 / 1024)}MB`);
            } catch (error) {
                console.error('[KeywordCache] ❌ Initialization failed:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * 🔍 중복 검사: 메모리에서만 확인 (DB 접근 없음)
     */
    has(keyword: string): boolean {
        if (!this.isInitialized) {
            throw new Error('[KeywordCache] Cache not initialized. Call init() first.');
        }
        return this.cache.has(keyword);
    }

    /**
     * ➕ 캐시 추가: 신규 키워드 저장 후 호출
     */
    add(keyword: string): void {
        this.cache.add(keyword);
    }

    /**
     * ➕ 배치 추가: 대량 저장 후 호출
     */
    addBatch(keywords: string[]): void {
        keywords.forEach(k => this.cache.add(k));
    }

    /**
     * 📊 캐시 통계
     */
    getStats(): { size: number; initialized: boolean } {
        return {
            size: this.cache.size,
            initialized: this.isInitialized
        };
    }

    /**
     * 🔄 캐시 리셋 (테스트용)
     */
    reset(): void {
        this.cache.clear();
        this.isInitialized = false;
        this.initPromise = null;
    }
}

// Singleton 인스턴스 export
export const keywordCache = KeywordCache.getInstance();
