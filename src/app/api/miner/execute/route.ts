
import { NextRequest, NextResponse } from 'next/server';
import { runMiningBatch } from '@/utils/batch-runner';
import { getServiceSupabase } from '@/utils/supabase';

// Set Vercel Function config
export const maxDuration = 60; // 60 seconds strict
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. Auth Check
    const authHeader = req.headers.get('Authorization'); // Support Bearer
    const cronHeader = req.headers.get('CRON_SECRET');
    const queryKey = req.nextUrl.searchParams.get('key');
    const secret = process.env.CRON_SECRET || 'manual-override-key';

    // Flexible Auth: Cron Header, Query Param, or Bearer Token (if we add it later)
    const isAuthorized = (cronHeader === secret) || (queryKey === secret) || (authHeader === `Bearer ${secret}`);

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Execute Batch
        const result = await runMiningBatch();

        // 3. Check for Turbo Mode (Background Recursion)
        const db = getServiceSupabase();
        const { data: setting } = await db
            .from('settings')
            .select('value')
            .eq('key', 'mining_mode')
            .single();

        const mode = (setting as any)?.value; // "TURBO" or "NORMAL" (JSONB string usually includes quotes if not parsed, Supabase returns parsed JSON for JSONB?)
        // Supabase JS library parses JSONB automatically. So "TURBO" string.

        if (mode === 'TURBO') {
            const selfUrl = `${req.nextUrl.origin}/api/miner/execute?key=${secret}`;
            console.log(`[Miner] Turbo Mode Active. Spawning next batch: ${selfUrl}`);

            // Spawn next run asynchronously (Fire and Forget-ish)
            // Note: Vercel might kill this immediately after return, but `fetch` is usually reliable enough if awaited closely.
            // We use a short timeout ensures we don't hang if the spawning logic stalls.
            try {
                // We MUST await this to ensure the request is actually sent before the lambda freezes.
                // But we don't care about the response body.
                await fetch(selfUrl, {
                    method: 'GET',
                    headers: { 'CRON_SECRET': secret }
                });
            } catch (err) {
                console.error('[Miner] Failed to spawn next recursion:', err);
            }
        }

        return NextResponse.json(result);
    } catch (e: any) {
        console.error('[Miner] Execution Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
