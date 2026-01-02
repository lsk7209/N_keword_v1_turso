
import { getTursoClient } from './turso';
import { BloomFilter } from './bloom-filter';

export class BloomManager {
    private static instance: BloomFilter | null = null;
    private static lastUpdate: number = 0;

    /**
     * Turso에서 블룸필터를 로드하거나 새로 생성합니다.
     */
    static async getFilter(): Promise<BloomFilter> {
        if (this.instance) return this.instance;

        const db = getTursoClient();
        try {
            const result = await db.execute("SELECT value FROM system_blobs WHERE key = 'bloom_filter_bin'");
            if (result.rows.length > 0 && result.rows[0].value) {
                const blob = result.rows[0].value as unknown as Uint8Array;
                this.instance = new BloomFilter(1024 * 1024, blob);
                console.log('[BloomManager] Loaded filter from system_blobs');
            } else {
                this.instance = new BloomFilter(1024 * 1024);
                console.log('[BloomManager] Created new filter');
            }
        } catch (e) {
            console.error('[BloomManager] Load failed:', e);
            this.instance = new BloomFilter(1024 * 1024);
        }
        return this.instance;
    }

    /**
     * 변경된 필터를 DB에 저장합니다.
     */
    static async saveFilter(filter: BloomFilter): Promise<void> {
        const db = getTursoClient();
        try {
            const data = filter.export();
            await db.execute({
                sql: "INSERT OR REPLACE INTO system_blobs (key, value, updated_at) VALUES ('bloom_filter_bin', ?, datetime('now'))",
                args: [data]
            });
            console.log('[BloomManager] Filter saved to system_blobs');
        } catch (e) {
            console.error('[BloomManager] Save failed:', e);
        }
    }
}
