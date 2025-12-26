'use server';

import { runMiningBatch } from '@/utils/batch-runner';
import { getTursoClient } from '@/utils/turso';
import { processSeedKeyword } from '@/utils/mining-engine';

export async function triggerMining() {
    try {
        console.log('[Args] Triggering mining batch manually...');
        const result = await runMiningBatch();
        return result;
    } catch (e: any) {
        console.error('Manual Trigger Error:', e);
        return { success: false, error: e.message };
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
                console.log(`[manualMining] 📋 Parameters: limitDocCount=30, skipDocFetch=false, minSearchVolume=1000, maxKeywords=1000`);
                
                // For manual collection, we want to fetch document counts as well.
                // Limit to 30 to avoid timeout (Vercel 60s limit)
                const startTime = Date.now();
                const result = await processSeedKeyword(seed, 30, false, 1000, 1000);
                const duration = Date.now() - startTime;
                
                console.log(`[manualMining] ✅ Success for "${seed}" (${duration}ms):`, {
                    processed: result.processed,
                    saved: result.saved,
                    itemsCount: result.items?.length || 0
                });
                
                results.push({
                    seed,
                    success: true,
                    data: result.items,
                    stats: { processed: result.processed, saved: result.saved }
                });
            } catch (e: any) {
                console.error(`[manualMining] ❌ Error processing "${seed}":`, {
                    message: e.message,
                    stack: e.stack,
                    name: e.name,
                    code: e.code,
                    cause: e.cause
                });
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