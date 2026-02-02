
import { NextRequest, NextResponse } from 'next/server';
import { runMiningBatch } from '@/utils/batch-runner';
import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword, bulkDeferredInsert } from '@/utils/mining-engine';

// Set Vercel Function config
export const maxDuration = 60; // 60 seconds strict
export const dynamic = 'force-dynamic';

/**
 * 🆕 큐에 등록된 대량 키워드 처리 (완전 수집)
 */
async function processQueuedBulkMining(): Promise<any> {
    const db = getTursoClient();
    const startTime = Date.now();
    const MAX_RUN_MS = 55000; // 55초 (Vercel 60초 제한 전에 종료)

    // 1. pending 상태의 큐 가져오기 (먼저 등록된 것부터)
    const queueResult = await db.execute({
        sql: `SELECT * FROM bulk_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`,
        args: []
    });

    if (queueResult.rows.length === 0) {
        return { message: 'No pending queue items', processed: 0 };
    }

    const queue = queueResult.rows[0];
    const queueId = String(queue.id);
    const seeds = JSON.parse(String(queue.seeds)) as string[];
    const alreadyProcessed = Number(queue.processed_seeds) || 0;

    // 🆕 이어서 처리: 이미 처리된 시드는 건너뜀
    const remainingSeeds = seeds.slice(alreadyProcessed);

    console.log(`[ProcessQueue] Starting queue ${queueId}: ${remainingSeeds.length} remaining (${alreadyProcessed}/${seeds.length} done)`);

    // 2. 상태를 processing으로 업데이트
    await db.execute({
        sql: `UPDATE bulk_queue SET status = 'processing', updated_at = ? WHERE id = ?`,
        args: [getCurrentTimestamp(), queueId]
    });

    // 3. 완전 수집 파라미터 (시간 제한 없음)
    const LIMIT_DOC_COUNT = 0; // 모든 키워드 문서 수 조회
    const MAX_KEYWORDS = 500;
    const MIN_VOLUME = 100;

    let processedSeeds = alreadyProcessed;
    let totalItems = Number(queue.result_count) || 0;
    const allItems: any[] = [];
    let lastError: string | null = null;

    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5; // 연속 5회 에러 시 큐 실패 처리

    for (const seed of remainingSeeds) {
        // 시간 초과 체크
        if (Date.now() - startTime > MAX_RUN_MS) {
            console.log(`[ProcessQueue] Time limit reached, stopping at seed ${processedSeeds}/${seeds.length}`);
            break;
        }

        // 🆕 연속 에러 제한: 무한루프 방지
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error(`[ProcessQueue] Too many consecutive errors (${consecutiveErrors}), marking queue as failed`);
            lastError = `Too many consecutive errors: ${consecutiveErrors}`;
            break;
        }

        try {
            console.log(`[ProcessQueue] Processing seed: ${seed} (${processedSeeds + 1}/${seeds.length})`);

            const result = await processSeedKeyword(
                seed,
                LIMIT_DOC_COUNT,
                false,
                MIN_VOLUME,
                MAX_KEYWORDS
            );

            if (result.items && result.items.length > 0) {
                allItems.push(...result.items);
                totalItems += result.items.length;
            }

            consecutiveErrors = 0; // 성공 시 에러 카운트 리셋

        } catch (error: any) {
            console.error(`[ProcessQueue] Error processing seed ${seed}:`, error.message);
            lastError = error.message;
            consecutiveErrors++;
        }

        // 🔴 핵심: 성공/실패 관계없이 항상 시드 카운트 증가 (무한루프 방지)
        processedSeeds++;

        // 진행 상황 업데이트
        await db.execute({
            sql: `UPDATE bulk_queue SET processed_seeds = ?, result_count = ?, updated_at = ? WHERE id = ?`,
            args: [processedSeeds, totalItems, getCurrentTimestamp(), queueId]
        });
    }

    // 4. DB에 저장 (Deferred Insert)
    if (allItems.length > 0) {
        // 중복 제거
        const uniqueMap = new Map<string, any>();
        allItems.forEach(item => {
            const existing = uniqueMap.get(item.keyword);
            if (!existing || (item.total_doc_cnt && !existing.total_doc_cnt)) {
                uniqueMap.set(item.keyword, item);
            }
        });
        const uniqueItems = Array.from(uniqueMap.values());

        await bulkDeferredInsert(uniqueItems);
        console.log(`[ProcessQueue] Saved ${uniqueItems.length} unique keywords to DB`);
    }

    // 5. 완료 상태 업데이트
    // 🔴 상태 결정 로직:
    // - 모든 시드 처리 완료 → 'completed'
    // - 연속 에러로 중단 → 'failed' (무한루프 방지)
    // - 시간 초과 → 'pending' (다음 cron에서 이어서 처리)
    let finalStatus: 'completed' | 'pending' | 'failed';
    if (processedSeeds >= seeds.length) {
        finalStatus = 'completed';
    } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        finalStatus = 'failed';
    } else {
        finalStatus = 'pending';
    }

    await db.execute({
        sql: `UPDATE bulk_queue SET status = ?, processed_seeds = ?, result_count = ?, error = ?, updated_at = ? WHERE id = ?`,
        args: [finalStatus, processedSeeds, totalItems, lastError, getCurrentTimestamp(), queueId]
    });

    const statusMessages = {
        completed: `완료: ${seeds.length}개 시드에서 ${totalItems}개 키워드 수집`,
        failed: `실패: 연속 ${consecutiveErrors}회 에러 발생 (${processedSeeds}/${seeds.length} 시드 처리됨)`,
        pending: `진행 중: ${processedSeeds}/${seeds.length} 시드 처리 (다음 cron에서 계속)`
    };

    return {
        queueId,
        status: finalStatus,
        processedSeeds,
        totalSeeds: seeds.length,
        resultCount: totalItems,
        elapsedMs: Date.now() - startTime,
        message: statusMessages[finalStatus]
    };
}

export async function GET(req: NextRequest) {
    // 1. Auth Check
    const authHeader = req.headers.get('Authorization'); // Support Bearer
    const cronHeader = req.headers.get('CRON_SECRET');
    const vercelCronHeader = req.headers.get('x-vercel-cron'); // Vercel Cron 자동 인증
    const queryKey = req.nextUrl.searchParams.get('key');
    const secret = process.env.CRON_SECRET || 'manual-override-key';

    // Flexible Auth: Vercel Cron (자동), Cron Header, Query Param, or Bearer Token
    const isAuthorized = vercelCronHeader === '1' || (cronHeader === secret) || (queryKey === secret) || (authHeader === `Bearer ${secret}`);

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Optional runtime tuning (safe clamps happen inside runMiningBatch)
        const taskParam = (req.nextUrl.searchParams.get('task') || 'all').toLowerCase();
        const task = (taskParam === 'fill_docs' || taskParam === 'expand' || taskParam === 'all' || taskParam === 'process_queue')
            ? (taskParam as 'fill_docs' | 'expand' | 'all' | 'process_queue')
            : 'all';

        // 🆕 Process Queue: 백그라운드 대량 키워드 완전 수집
        if (task === 'process_queue') {
            const queueResult = await processQueuedBulkMining();
            return NextResponse.json(queueResult);
        }

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
        const db = getTursoClient();
        const settingResult = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: ['mining_mode']
        });
        const setting = settingResult.rows.length > 0 ? { value: settingResult.rows[0].value } : null;

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
            const fillErrors = result.fillDocs?.error ? [result.fillDocs.error] : [];
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

                console.warn(`[Miner] TURBO PAUSED: ${reason}. Will retry in next loop.`);

                // ⚠️ CHANGED: Do NOT disable Turbo Mode. Just stop this specific run.
                // This ensures the loop continues once keys cool down.
                /*
                await db.execute({
                    sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
                    args: ['mining_mode', 'NORMAL', new Date().toISOString()]
                });
                */

                return NextResponse.json({
                    ...result,
                    info: `Turbo Mode Paused (${reason}). Will retry via cron/loop.`
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
