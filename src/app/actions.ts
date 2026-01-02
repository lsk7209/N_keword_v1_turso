'use server';

import { runMiningBatch } from '@/utils/batch-runner';
import { getTursoClient } from '@/utils/turso';
import { processSeedKeyword, bulkDeferredInsert } from '@/utils/mining-engine';

export async function triggerMining() {
    try {
        console.log('[Args] Triggering mining batch manually...');
        const result = await runMiningBatch();

        // runMiningBatch returns the actual result object (expand, fillDocs, etc.)
        // We need to wrap it with success flag for the UI
        return {
            success: true,
            ...result
        };
    } catch (e: any) {
        console.error('Manual Trigger Error:', e);
        return {
            success: false,
            error: e.message || 'Mining batch failed with unknown error'
        };
    }
}

export async function manualMining(keywords: string[]) {
    try {
        console.log('[manualMining] Starting with keywords:', keywords);

        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return { success: false, error: 'Keywords must be a non-empty array' };
        }

        const seeds = keywords
            .map(k => k.trim())
            .filter(Boolean)
            .slice(0, 5); // Limit 5

        if (seeds.length === 0) {
            return { success: false, error: 'No valid keywords provided' };
        }

        console.log('[manualMining] Processing seeds:', seeds);
        const results = [];

        for (const seed of seeds) {
            try {
                console.log(`[manualMining] 🔍 Processing seed: "${seed}"`);
                console.log(`[manualMining] 📋 Parameters: limitDocCount=30, skipDocFetch=false, minSearchVolume=100, maxKeywords=1000`);

                // For manual collection, we want to fetch document counts as well.
                // Limit to 30 to avoid timeout (Vercel 60s limit)
                const startTime = Date.now();
                const result = await processSeedKeyword(seed, 30, false, 100, 1000);
                const duration = Date.now() - startTime;

                // 🚀 수집된 키워드와 시드 키워드 자체를 DB에 저장
                let insertedCount = 0;
                if (result.items && result.items.length > 0) {
                    // 시드 키워드 자체도 저장 대상에 포함 (이미 있으면 업데이트됨)
                    const seedItem = {
                        keyword: seed,
                        total_search_cnt: result.items[0]?.total_search_cnt || 0, // 대략적인 값이라도 할당
                        is_expanded: true, // 시드는 이미 확장됨
                        updated_at: new Date().toISOString()
                    };

                    const allItems = [seedItem, ...result.items];
                    const insertResult = await bulkDeferredInsert(allItems);
                    insertedCount = insertResult.inserted + insertResult.updated;
                    console.log(`[manualMining] 💾 Saved ${insertResult.inserted} new, updated ${insertResult.updated} keywords for seed "${seed}"`);
                }

                // 시드 키워드 상태 명시적 업데이트 (is_expanded = 1)
                const db = getTursoClient();
                await db.execute({
                    sql: 'UPDATE keywords SET is_expanded = 1, updated_at = ? WHERE keyword = ?',
                    args: [new Date().toISOString(), seed]
                });

                console.log(`[manualMining] ✅ Success for "${seed}" (${duration}ms):`, {
                    processed: result.processed,
                    saved: result.saved,
                    insertedToDb: insertedCount,
                    itemsCount: result.items?.length || 0
                });

                results.push({
                    seed,
                    success: true,
                    data: result.items,
                    stats: { processed: result.processed, saved: result.saved, inserted: insertedCount }
                });
            } catch (e: any) {
                console.error(`[manualMining] ❌ Error processing "${seed}":`, e);
                results.push({
                    seed,
                    success: false,
                    error: e.message || 'Unknown error'
                });
            }
        }

        console.log('[manualMining] Completed. Results:', results.length);
        return { success: true, results };
    } catch (e: any) {
        console.error('[manualMining] Fatal error:', e);
        return { success: false, error: e.message || 'Unknown error occurred' };
    }
}

export async function setMiningMode(mode: 'NORMAL' | 'TURBO') {
    try {
        const db = getTursoClient();
        await db.execute({
            sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
            args: ['mining_mode', mode, new Date().toISOString()]
        });

        console.log('[setMiningMode] Successfully set mode to:', mode);
        return { success: true };
    } catch (e: any) {
        console.error('[setMiningMode] Error:', e);
        return { success: false, error: e.message };
    }
}

export async function getMiningMode() {
    try {
        const db = getTursoClient();
        const result = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: ['mining_mode']
        });

        let mode: 'NORMAL' | 'TURBO' = 'TURBO';

        if (result.rows.length > 0) {
            const rawValue = result.rows[0].value as string;
            mode = rawValue.toUpperCase() as 'NORMAL' | 'TURBO';

            // 유효성 검사
            if (mode !== 'NORMAL' && mode !== 'TURBO') {
                console.warn('[getMiningMode] Invalid mode value:', mode, 'defaulting to TURBO');
                mode = 'TURBO';
            }
        }

        console.log('[getMiningMode] Retrieved mode:', mode);
        return { success: true, mode };
    } catch (e: any) {
        console.error('[getMiningMode] Error:', e);
        return { success: false, mode: 'TURBO' as const, error: e.message };
    }
}