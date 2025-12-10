'use server';

import { runMiningBatch } from '@/utils/batch-runner';

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
