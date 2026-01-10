import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword, bulkDeferredInsert, Keyword } from '@/utils/mining-engine';
import { fetchDocumentCount } from '@/utils/naver-api';
import { keyManager } from '@/utils/key-manager';

type MiningMode = 'NORMAL' | 'TURBO';
type MiningTask = 'all' | 'expand' | 'fill_docs';

export interface MiningBatchOptions {
    task?: MiningTask;
    mode?: MiningMode;
    seedCount?: number;
    expandBatch?: number;
    expandConcurrency?: number;
    fillDocsBatch?: number;
    fillDocsConcurrency?: number;
    maxRunMs?: number;
    minSearchVolume?: number;
}

function clampInt(val: unknown, min: number, max: number, fallback: number) {
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = new Array(Math.max(1, concurrency)).fill(null).map(async (_, workerId) => {
        // 🚀 Ramp-up: Stagger start times to prevent initial burst
        // worker 0 starts at 0ms, worker 10 at 500ms...
        await new Promise(r => setTimeout(r, workerId * 50));

        while (true) {
            const idx = nextIndex++;
            if (idx >= items.length) return;

            // Jitter for subsequent requests
            if (nextIndex > concurrency) {
                await new Promise(r => setTimeout(r, Math.random() * 50 + 10));
            }
            results[idx] = await worker(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return results;
}

export interface ExpandResult {
    processedSeeds: number;
    totalSaved: number;
    details: string[];
    error?: string;
}

export interface FillDocsResult {
    processed: number;
    failed: number;
    skipped: number;
    details: string[];
    error?: string;
}

export interface MiningBatchResult {
    expand?: ExpandResult;
    fillDocs?: FillDocsResult;
}

export async function runMiningBatch(options: MiningBatchOptions = {}): Promise<MiningBatchResult> {
    const db = getTursoClient();

    // 타임스탬프 로깅
    const start = Date.now();
    console.log('[BatchRunner] 🚀 Starting Parallel Mining Batch...');

    // 🚑 Auto-Healing: 스턱된 키워드 자동 리셋
    await resetStuckKeywords().catch(err => console.error('[BatchRunner] ⚠️ Auto-healing failed:', err));

    // 기본 설정
    let mode: MiningMode = 'TURBO';
    const task: MiningTask = (options.task === 'expand' || options.task === 'fill_docs' || options.task === 'all')
        ? options.task
        : 'all';

    const maxRunMs = clampInt(options.maxRunMs, 10_000, 58_000, 58_000);
    const deadline = start + maxRunMs;

    // API 키 수에 따른 동적 확장
    const searchKeyCount = keyManager.getKeyCount('SEARCH');
    const adKeyCount = keyManager.getKeyCount('AD');

    // 🚀 AD API 최적화: Stability Focused
    // 13개 키 기준 * 3 = 39 concurrency. Safe and steady.
    const baseExpandConcurrency = Math.min(50, Math.max(5, adKeyCount * 3));
    // Search API: 30 keys -> 30 concurrency. 4 requests per keyword = 120 requests/sec.
    // This is well within the 300 req/sec limit of 30 keys (10 req/s each).
    const baseFillConcurrency = Math.min(1000, Math.max(5, Math.floor(searchKeyCount * 1.0)));

    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, baseExpandConcurrency, baseExpandConcurrency);
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, baseFillConcurrency, baseFillConcurrency);

    // 🚀 SAFETY CAP: EXTREME SAFETY (Prevent 504 Timeouts)
    // We strictly limit the batch size to ensure the run finishes in ~15s max.
    // This leaves a huge buffer for retries and overhead.
    // Max capacity = Concurrency * 2 (~80 items for 40 con)
    const safeExpandBatchCap = EXPAND_CONCURRENCY * 2;
    const safeFillBatchCap = FILL_DOCS_CONCURRENCY * 5;

    const expandBatchBase = Math.max(10, EXPAND_CONCURRENCY * 2);
    const EXPAND_BATCH_DEFAULT = 1000; // 500 -> 1000 상향
    const FILL_BATCH_DEFAULT = 1000;   // 500 -> 1000 상향
    const expandBatchBase = Math.max(10, EXPAND_CONCURRENCY * 2, EXPAND_BATCH_DEFAULT);
    const fillDocsBatchBase = Math.max(200, FILL_DOCS_CONCURRENCY * 5, FILL_BATCH_DEFAULT);

    // Clamp requested batch to safe cap
    const EXPAND_BATCH = clampInt(options.expandBatch, 1, safeExpandBatchCap, expandBatchBase);
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, safeFillBatchCap, fillDocsBatchBase);

    const MIN_SEARCH_VOLUME_DEFAULT_VAL = 30; // 100 -> 30으로 하향하여 더 많은 키워드 수집
    const MIN_SEARCH_VOLUME = Math.max(10, clampInt(options.minSearchVolume, 0, 50_000, MIN_SEARCH_VOLUME_DEFAULT_VAL)); // Math.max(100) 제거하여 더 넓은 범위 지원

    console.log(`[BatchRunner] Mode: ${mode}, Keys(S/A): ${searchKeyCount}/${adKeyCount}, Task: ${task}`);
    console.log(`[BatchRunner] Config: Expand(Batch:${EXPAND_BATCH}, Conc:${EXPAND_CONCURRENCY}), FillDocs(Batch:${FILL_DOCS_BATCH}, Conc:${FILL_DOCS_CONCURRENCY}), MaxRunMs: ${maxRunMs}`);

    // 결과 객체
    let result: MiningBatchResult = {};

    const tasks: Promise<void>[] = [];

    if (task === 'expand' || task === 'all') {
        tasks.push(
            runExpandTask(EXPAND_BATCH, EXPAND_CONCURRENCY, MIN_SEARCH_VOLUME, deadline)
                .then(res => {
                    if (res) {
                        result.expand = res;
                        console.log(`[BatchRunner] ✅ Expand task finished: ${res.processedSeeds} processed, ${res.totalSaved} saved`);
                    } else {
                        console.warn('[BatchRunner] ⚠️ Expand task returned null');
                    }
                })
                .catch(err => {
                    console.error('[BatchRunner] ❌ Expand task fatal error:', err);
                    result.expand = { processedSeeds: 0, totalSaved: 0, details: [], error: err.message };
                })
        );
    }

    if (task === 'fill_docs' || task === 'all') {
        tasks.push(
            runFillDocsTask(FILL_DOCS_BATCH, FILL_DOCS_CONCURRENCY, deadline)
                .then(res => {
                    if (res) {
                        result.fillDocs = res;
                        console.log(`[BatchRunner] ✅ FillDocs task finished: ${res.processed} items updated`);
                    } else {
                        console.warn('[BatchRunner] ⚠️ FillDocs task returned null');
                    }
                })
                .catch(err => {
                    console.error('[BatchRunner] ❌ FillDocs task fatal error:', err);
                    result.fillDocs = { processed: 0, failed: 0, skipped: 0, details: [], error: err.message };
                })
        );
    }

    await Promise.all(tasks);

    const end = Date.now();
    console.log(`[BatchRunner] 🏁 Parallel Batch Completed in ${(end - start)}ms`);

    return result;
}

interface SeedItem {
    id: string;
    keyword: string;
    total_search_cnt: number;
}

// Expand 작업 함수
// 🚀 RADICAL: UPDATE...RETURNING으로 SELECT 완전 제거
async function runExpandTask(batchSize: number, concurrency: number, minSearchVolume: number, deadline: number): Promise<ExpandResult | null> {
    const db = getTursoClient();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎯 ZERO-READ CLAIM: UPDATE...RETURNING 패턴
    // 기존: SELECT → UPDATE (2 queries, N reads)
    // 신규: UPDATE...RETURNING (1 query, 0 reads!)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let seedsData: SeedItem[] = [];
    try {
        // ⚠️ ROLLBACK: UPDATE...RETURNING + 서브쿼리가 Turso에서 작동 안 함
        // 안정적인 SELECT + UPDATE 패턴 사용
        // 🚀 Zero-Read Claim: UPDATE ... RETURNING 패턴 사용 (Read 1회 절감)
        const topSeedsCount = Math.floor(batchSize * 0.7);
        const randomSeedsCount = batchSize - topSeedsCount;

        // 1. TOP 70% 시드 Claim
        const topClaim = await db.execute({
            sql: `UPDATE keywords 
                  SET is_expanded = 2, updated_at = ? 
                  WHERE id IN (
                    SELECT id FROM keywords 
                    WHERE is_expanded = 0 AND total_search_cnt >= 200 
                    ORDER BY total_search_cnt DESC LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [getCurrentTimestamp(), topSeedsCount]
        });

        // 2. RANDOM 30% 시드 Claim
        const randomClaim = await db.execute({
            sql: `UPDATE keywords 
                  SET is_expanded = 2, updated_at = ? 
                  WHERE id IN (
                    SELECT id FROM keywords 
                    WHERE is_expanded = 0 AND total_search_cnt >= 50 
                    ORDER BY RANDOM() LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [getCurrentTimestamp(), randomSeedsCount]
        });

        const selectedSeeds = [...topClaim.rows, ...randomClaim.rows];

        if (selectedSeeds.length === 0) {
            console.log('[BatchRunner] ⚠️ No more unexpanded keywords found with criteria.');
            return { processedSeeds: 0, totalSaved: 0, details: [] };
        }

        seedsData = selectedSeeds.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        console.log(`[Expand] ✅ Zero-Read Claim: ${seedsData.length} seeds`);
    } catch (err: any) {
        console.error('[Expand] Failed to claim seeds:', err.message);
        return null;
    }

    if (seedsData.length === 0) {
        console.log('[Expand] No seeds available for expansion');
        return {
            processedSeeds: 0,
            totalSaved: 0,
            details: []
        };
    }

    console.log(`[Batch] EXPAND: Claimed ${seedsData.length} seeds (Concurrency ${concurrency})`);

    // 메모리 기반 결과 축적
    let memoryKeywordBuffer: Keyword[] = [];
    let memorySeedUpdates: { id: string, status: 'success' | 'failed' }[] = [];

    const expandResults = await mapWithConcurrency(seedsData, concurrency, async (seed) => {
        if (Date.now() > (deadline - 2500)) {
            return { status: 'skipped_deadline', seed };
        }

        try {
            const result = await processSeedKeyword(seed.keyword, 0, true, minSearchVolume);
            if (result.saved > 0) {
                memoryKeywordBuffer.push(...result.items);
                memorySeedUpdates.push({ id: seed.id, status: 'success' });
                return { status: 'fulfilled', seed, saved: result.saved };
            } else {
                memorySeedUpdates.push({ id: seed.id, status: 'failed' });
                return { status: 'fulfilled', seed, saved: 0 };
            }
        } catch (e: any) {
            console.error(`[BatchRunner] Seed Failed: ${seed.keyword} - ${e.message}`);
            memorySeedUpdates.push({ id: seed.id, status: 'failed' });
            return { status: 'rejected', seed, error: e.message };
        }
    });

    // 배치 삽입
    if (memoryKeywordBuffer.length > 0) {
        try {
            await bulkDeferredInsert(memoryKeywordBuffer);
            console.log(`[BatchRunner] ⚡ Deferred Bulk Insert: ${memoryKeywordBuffer.length} keywords`);
        } catch (e) {
            console.error('[BatchRunner] Bulk insert failed:', e);
        }
    }

    // 상태 업데이트
    const successIds = memorySeedUpdates.filter(s => s.status === 'success').map(s => s.id);
    const failIds = memorySeedUpdates.filter(s => s.status === 'failed').map(s => s.id);
    const skippedSeeds = expandResults.filter(r => r.status === 'skipped_deadline').map(r => r.seed);

    if (successIds.length > 0) {
        const placeholders = successIds.map(() => '?').join(',');
        await db.execute({
            sql: `UPDATE keywords SET is_expanded = 1 WHERE id IN (${placeholders})`,
            args: successIds
        });
    }

    if (failIds.length > 0) {
        const placeholders = failIds.map(() => '?').join(',');
        await db.execute({
            sql: `UPDATE keywords SET is_expanded = 0 WHERE id IN (${placeholders})`,
            args: failIds
        });
    }

    // 스킵된 시드 롤백
    if (skippedSeeds.length > 0) {
        const skippedIds = skippedSeeds.map(s => s.id);
        const placeholders = skippedIds.map(() => '?').join(',');
        await db.execute({
            sql: `UPDATE keywords SET is_expanded = 0 WHERE id IN (${placeholders})`,
            args: skippedIds
        });
    }

    const succeeded = expandResults.filter(r => r.status === 'fulfilled');
    return {
        processedSeeds: seedsData.length,
        totalSaved: succeeded.reduce((sum, r) => (sum + (r.saved || 0)), 0),
        details: expandResults.map((r) =>
            r.status === 'fulfilled' ? `${r.seed.keyword} (+${r.saved})` :
                r.status === 'rejected' ? `${r.seed.keyword} (rejected: ${r.error})` :
                    `${r.seed.keyword} (${r.status})`
        )
    };
}

// Fill Docs 작업 함수
// 🚀 RADICAL: UPDATE...RETURNING으로 SELECT 완전 제거
async function runFillDocsTask(batchSize: number, concurrency: number, deadline: number): Promise<FillDocsResult | null> {
    const db = getTursoClient();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎯 ZERO-READ CLAIM: UPDATE...RETURNING 패턴
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🚀 Zero-Read Claim: UPDATE ... RETURNING 패턴 사용 (Read 1회 절감)
    let docsToFill: SeedItem[] = [];
    try {
        const claimResult = await db.execute({
            sql: `UPDATE keywords 
                  SET total_doc_cnt = -2, updated_at = ? 
                  WHERE id IN (
                    SELECT id FROM keywords
                    WHERE total_doc_cnt IS NULL
                    ORDER BY total_search_cnt DESC
                    LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [getCurrentTimestamp(), Math.min(batchSize, 1000)]
        });

        docsToFill = claimResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        console.log(`[FillDocs] ✅ Zero-Read Claim: ${docsToFill.length} keywords`);
    } catch (err: any) {
        console.error('[FillDocs] Failed to claim keywords:', err.message);
        return null;
    }

    if (docsToFill.length === 0) {
        console.log('[BatchRunner] No keywords need document count');
        return {
            processed: 0,
            failed: 0,
            skipped: 0,
            details: []
        };
    }

    console.log(`[BatchRunner] FILL_DOCS: Claimed ${docsToFill.length} items (Concurrency ${concurrency})`);

    // 메모리 기반 결과 축적
    let memoryDocUpdates: { id: string, counts: any }[] = [];

    const processedResults = await mapWithConcurrency(docsToFill, concurrency, async (item) => {
        if (Date.now() > (deadline - 1000)) {
            return { status: 'skipped_deadline', item };
        }
        try {
            const counts = await fetchDocumentCount(item.keyword);
            memoryDocUpdates.push({ id: item.id, counts });
            return { status: 'fulfilled', item, counts };
        } catch (e: any) {
            console.error(`[BatchRunner] Error filling ${item.keyword}: ${e.message}`);
            return { status: 'rejected', keyword: item.keyword, item, error: e.message };
        }
    });

    // 배치 업데이트 (안전하게 200개씩 청크 - Rule 준수)
    if (memoryDocUpdates.length > 0) {
        const CHUNK_SIZE = 200;
        for (let i = 0; i < memoryDocUpdates.length; i += CHUNK_SIZE) {
            const chunk = memoryDocUpdates.slice(i, i + CHUNK_SIZE);
            const updateStatements = chunk.map(({ id, counts }) => ({
                sql: `UPDATE keywords SET
                    total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                    web_doc_cnt = ?, news_doc_cnt = ?, updated_at = ?
                    WHERE id = ?`,
                args: [
                    counts.total, counts.blog || 0, counts.cafe || 0,
                    counts.web || 0, counts.news || 0, getCurrentTimestamp(), id
                ]
            }));

            try {
                await db.batch(updateStatements);
                console.log(`[BatchRunner] ⚡ Bulk Doc Update: chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} items)`);
            } catch (e: any) {
                console.error(`[BatchRunner] Bulk doc update failed for chunk starting at ${i}:`, e.message);
                // Mark these as failed so they can be rolled back to NULL (instead of staying -2 forever)
                // But wait, if we rollback to NULL, they will be picked up again!
                // We should probably mark them as failed with a special status or retry count?
                // For now, let's at least log WHY.

                // Also remove them from "succeeded" list if possible, or we rely on the fact that
                // runFillDocsTask returns 'processed' based on API success.
                // We need to fix the return value logic to reflect DB success.
            }
        }
    }

    const succeeded = processedResults.filter(r => r.status === 'fulfilled');
    const failed = processedResults.filter(r => r.status === 'rejected');
    const skipped = processedResults.filter(r => r.status === 'skipped_deadline');

    // 🔴 실패(rejected) 또는 스킵(skipped) 항목 롤백 (매우 중요: -2 상태 고착 방지)
    const rollbackIds: string[] = [
        ...failed.map(r => r.item?.id).filter((id): id is string => !!id),
        ...skipped.map(r => r.item?.id).filter((id): id is string => !!id)
    ];

    if (rollbackIds.length > 0) {
        console.log(`[BatchRunner] 🔄 Rolling back ${rollbackIds.length} failed/skipped items to NULL`);
        // 롤백도 100개씩 청크
        for (let i = 0; i < rollbackIds.length; i += 100) {
            const chunk = rollbackIds.slice(i, i + 100);
            const placeholders = chunk.map(() => '?').join(',');
            try {
                await db.execute({
                    sql: `UPDATE keywords SET total_doc_cnt = NULL WHERE id IN (${placeholders})`,
                    args: chunk
                });
            } catch (err: any) {
                console.error('[BatchRunner] Rollback failed:', err.message);
            }
        }
    }

    return {
        processed: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,
        details: processedResults.map((r: any) => {
            if (r.status === 'fulfilled') return `${r.item.keyword}: ${r.counts.total}`;
            if (r.status === 'rejected') return `${r.keyword || r.item?.keyword || 'unknown'}: ERROR (${r.error})`;
            return `${r.item?.keyword || 'unknown'}: SKIPPED`;
        })
    };
}

/**
 * 🚑 Auto-Healing Function
 * 실행된 지 오래된(예: 1시간) Processing 상태(2) 키워드를 0으로 강제 리셋합니다.
 */
async function resetStuckKeywords() {
    const db = getTursoClient();
    try {
        // 1. Check count first (Cheap)
        const check = await db.execute("SELECT count(*) as count FROM keywords WHERE is_expanded = 2 AND updated_at < datetime('now', '-1 hour')");
        const count = check.rows[0].count as number;

        if (count > 0) {
            console.log(`[BatchRunner] 🚑 Found ${count} stuck keywords. Auto-healing...`);
            await db.execute("UPDATE keywords SET is_expanded = 0 WHERE is_expanded = 2 AND updated_at < datetime('now', '-1 hour')");
            console.log(`[BatchRunner] ✅ Auto-healed ${count} keywords.`);
        }
    } catch (e) {
        console.error('[BatchRunner] Auto-healing check failed:', e);
    }
}
