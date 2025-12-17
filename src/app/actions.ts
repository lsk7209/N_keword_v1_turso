'use server';

import { runMiningBatch } from '@/utils/batch-runner';
import { getTursoClient } from '@/utils/turso';

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