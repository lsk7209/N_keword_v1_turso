
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
        // Optional runtime tuning (safe clamps happen inside runMiningBatch)
        const taskParam = (req.nextUrl.searchParams.get('task') || 'all').toLowerCase();
        const task = (taskParam === 'fill_docs' || taskParam === 'expand' || taskParam === 'all')
            ? (taskParam as 'fill_docs' | 'expand' | 'all')
            : 'all';

        const fillBatch = req.nextUrl.searchParams.get('fillBatch');
        const fillConcurrency = req.nextUrl.searchParams.get('fillConcurrency');
        const seedCount = req.nextUrl.searchParams.get('seedCount');
        const expandBatch = req.nextUrl.searchParams.get('expandBatch');
        const expandConcurrency = req.nextUrl.searchParams.get('expandConcurrency');
        const minSearchVolume = req.nextUrl.searchParams.get('minSearchVolume');
        const maxRunMs = req.nextUrl.searchParams.get('maxRunMs');

        const modeOverrideRaw = (req.nextUrl.searchParams.get('mode') || '').toUpperCase();
        const modeOverride = (modeOverrideRaw === 'NORMAL' || modeOverrideRaw === 'TURBO') ? (modeOverrideRaw as 'NORMAL' | 'TURBO') : undefined;

        // 2. Execute Batch
        const result = await runMiningBatch({
            task,
            mode: modeOverride,
            seedCount: seedCount ? Number(seedCount) : undefined,
            expandBatch: expandBatch ? Number(expandBatch) : undefined,
            expandConcurrency: expandConcurrency ? Number(expandConcurrency) : undefined,
            fillDocsBatch: fillBatch ? Number(fillBatch) : undefined,
            fillDocsConcurrency: fillConcurrency ? Number(fillConcurrency) : undefined,
            minSearchVolume: minSearchVolume ? Number(minSearchVolume) : undefined,
            maxRunMs: maxRunMs ? Number(maxRunMs) : undefined
        });

        // 3. Check for Turbo Mode (Background Recursion)
        const db = getServiceSupabase();
        const { data: setting } = await db
            .from('settings')
            .select('value')
            .eq('key', 'mining_mode')
            .single();

        // JSONB 값 파싱 (getMiningMode와 동일한 로직)
        let mode: 'NORMAL' | 'TURBO' = 'TURBO';
        if (setting) {
            const rawValue = (setting as any)?.value;
            if (typeof rawValue === 'string') {
                mode = rawValue.replace(/^"|"$/g, '').toUpperCase() as 'NORMAL' | 'TURBO';
            } else {
                mode = String(rawValue).toUpperCase() as 'NORMAL' | 'TURBO';
            }
            if (mode !== 'NORMAL' && mode !== 'TURBO') {
                mode = 'TURBO';
            }
        }

        console.log(`[Miner] Current mode: ${mode}, Result:`, { 
            expand: result.expand?.totalSaved || 0, 
            fillDocs: result.fillDocs?.processed || 0 
        });

        // NOTE:
        // Vercel serverless functions are not a reliable environment for "fire-and-forget" recursion.
        // We keep the previous recursion behavior behind an explicit env flag so production can safely
        // drive throughput via GitHub Actions loop calls instead.
        const allowSelfSpawn = process.env.TURBO_SELF_SPAWN === '1';

        if (mode === 'TURBO' && allowSelfSpawn) {
            // Check for Stop Conditions (Quota Exhaustion or System Failure)
            const fillErrors = result.fillDocs?.errors || [];
            const expandErrors = result.expand?.details?.filter((d: string) => d.includes('rejected') || d.includes('error')) || [];
            const allErrors = [...fillErrors, ...expandErrors];
            
            // 검색 API 키 소진 체크
            const isSearchKeyExhausted = allErrors.some((e: string) => 
                e.includes('No SEARCH keys') || 
                e.includes('All SEARCH keys are rate limited')
            );
            
            // 검색광고 API 키 소진 체크
            const isAdKeyExhausted = allErrors.some((e: string) => 
                e.includes('No AD keys') || 
                e.includes('All AD keys are rate limited') ||
                e.includes('Failed to fetch related keywords')
            );

            const totalTried = (result.fillDocs?.processed || 0) + (result.fillDocs?.failed || 0);
            const isTotalFailure = totalTried > 0 && (result.fillDocs?.processed || 0) === 0;

            // API 키 모두 소진 또는 연속 실패 시 자동 중지
            if (isSearchKeyExhausted || isAdKeyExhausted || (isTotalFailure && allErrors.length > 5)) {
                const reason = isSearchKeyExhausted ? 'Search API Keys Exhausted' 
                    : isAdKeyExhausted ? 'Ad API Keys Exhausted'
                    : 'High Failure Rate';
                
                console.warn(`[Miner] TURBO STOP: ${reason}. Auto-switching to NORMAL mode.`);

                // Disable Turbo Mode in DB (자동으로 일반 모드로 변경)
                await db.from('settings' as any).upsert({ key: 'mining_mode', value: 'NORMAL' } as any);

                return NextResponse.json({
                    ...result,
                    info: `Turbo Mode Automatically Stopped (${reason}). Switched to NORMAL mode.`
                });
            }

            const selfUrl = `${req.nextUrl.origin}/api/miner/execute?key=${secret}`;
            console.log(`[Miner] Turbo Mode Active. Spawning next batch: ${selfUrl}`);

            // Spawn next run (best-effort). Keep awaited behavior to avoid unhandled work getting dropped.
            try {
                await fetch(selfUrl, {
                    method: 'GET',
                    headers: { 'CRON_SECRET': secret }
                });
            } catch (err) {
                console.error('[Miner] Failed to spawn next recursion:', err);
            }
        } else {
            // 일반 모드: GitHub Actions가 5분마다 호출하므로 자동 수집 진행 중
            console.log('[Miner] Normal Mode: Auto-collection via GitHub Actions (every 5 minutes)');
        }

        return NextResponse.json({
            ...result,
            mode: mode,
            info: mode === 'TURBO' 
                ? (allowSelfSpawn ? 'Turbo Mode: Continuous background execution' : 'Turbo Mode: Driven by scheduler (GitHub Actions loop recommended)') 
                : 'Normal Mode: Scheduled execution via GitHub Actions (every 5 minutes)'
        });
    } catch (e: any) {
        console.error('[Miner] Execution Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
