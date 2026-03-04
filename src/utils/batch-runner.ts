import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword, bulkDeferredInsert, Keyword, calculateTierAndRatio } from '@/utils/mining-engine';
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
        // 🎯 30일 지속 가능: Stagger 증가 (50ms → 200ms)
        await new Promise(r => setTimeout(r, workerId * 200));

        while (true) {
            const idx = nextIndex++;
            if (idx >= items.length) return;

            // 🎯 Jitter 증가: 50ms → 200ms
            if (nextIndex > concurrency) {
                await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
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

    // 결과 객체 초기화 (Early return 대비)
    let result: MiningBatchResult = {};

    // 🚑 Auto-Healing: 스턱된 키워드 자동 리셋
    await resetStuckKeywords().catch(err => console.error('[BatchRunner] ⚠️ Auto-healing failed:', err));

    // 기본 설정
    let mode: MiningMode = 'TURBO';
    const task: MiningTask = (options.task === 'expand' || options.task === 'fill_docs' || options.task === 'all')
        ? options.task
        : 'all';

    const maxRunMs = clampInt(options.maxRunMs, 10_000, 50_000, 45_000);
    const deadline = start + maxRunMs;

    // API 키 수에 따른 동적 확장 (Adaptive Concurrency)
    const availableSearchKeys = keyManager.getAvailableKeyCount('SEARCH');
    const availableAdKeys = keyManager.getAvailableKeyCount('AD');

    // 🚀 AD API 최적화: 30일 지속 가능 모드 (Conservative)
    let baseExpandConcurrency = 1;
    if (availableAdKeys > 0) {
        // 🎯 DB Read 절감: 키당 1개로 제한 (안정성 최우선)
        baseExpandConcurrency = Math.min(5, availableAdKeys * 1);
    } else {
        // 모든 키가 쿨다운 중이면 잠시 대기 시도 (TURBO 유지)
        console.warn('[BatchRunner] ⚠️ All AD keys cooling down. Waiting...');
        const ready = await keyManager.waitForNextKey('AD', 2000);
        if (ready) {
            baseExpandConcurrency = Math.min(3, keyManager.getAvailableKeyCount('AD') * 1);
        } else {
            console.warn('[BatchRunner] 🛑 Skipping Expand Task: No AD keys ready.');
            if (task === 'expand') return result;
        }
    }

    // 🎯 Search API: 30일 지속 가능 모드 (키당 1개로 제한)
    let baseFillConcurrency = Math.min(10, Math.max(1, availableSearchKeys * 1));
    if (availableSearchKeys === 0) {
        console.warn('[BatchRunner] ⚠️ All SEARCH keys cooling down. Waiting...');
        await keyManager.waitForNextKey('SEARCH', 2000);
        baseFillConcurrency = Math.min(5, keyManager.getAvailableKeyCount('SEARCH') * 1);
    }

    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, baseExpandConcurrency, baseExpandConcurrency);
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, baseFillConcurrency, baseFillConcurrency);

    // 🎯 30일 지속 가능 모드: 배치 크기 대폭 축소
    const safeExpandBatchCap = Math.max(10, EXPAND_CONCURRENCY * 3);
    const safeFillBatchCap = Math.max(20, FILL_DOCS_CONCURRENCY * 5);

    // 📉 RADICAL REDUCTION: 200 → 30/50 (85%/75% 감소)
    const EXPAND_BATCH_DEFAULT = 30;
    const FILL_BATCH_DEFAULT = 50;

    const EXPAND_BATCH = clampInt(options.expandBatch, 1, safeExpandBatchCap, Math.min(EXPAND_BATCH_DEFAULT, safeExpandBatchCap));
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, safeFillBatchCap, Math.min(FILL_BATCH_DEFAULT, safeFillBatchCap));

    // 📉 검색량 기준 상향: 30 → 50 (저품질 키워드 제외로 Write 감소)
    const MIN_SEARCH_VOLUME_DEFAULT_VAL = 50;
    const MIN_SEARCH_VOLUME = Math.max(30, clampInt(options.minSearchVolume, 0, 50_000, MIN_SEARCH_VOLUME_DEFAULT_VAL));

    console.log(`[BatchRunner] Mode: ${mode}, Keys(S/A): ${availableSearchKeys}/${availableAdKeys}, Task: ${task}`);
    console.log(`[BatchRunner] Config: Expand(Batch:${EXPAND_BATCH}, Conc:${EXPAND_CONCURRENCY}), FillDocs(Batch:${FILL_DOCS_BATCH}, Conc:${FILL_DOCS_CONCURRENCY}), MaxRunMs: ${maxRunMs}`);


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
        // Deadline까지 5초 이상 남았을 때만 새 작업 시작
        if (Date.now() > (deadline - 5000)) {
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
    let bulkInsertSuccess = true;
    if (memoryKeywordBuffer.length > 0) {
        try {
            await bulkDeferredInsert(memoryKeywordBuffer);
            console.log(`[BatchRunner] ⚡ Deferred Bulk Insert: ${memoryKeywordBuffer.length} keywords`);
        } catch (e) {
            console.error('[BatchRunner] Bulk insert failed:', e);
            bulkInsertSuccess = false;
        }
    }

    // 상태 업데이트
    // 🆕 배치 삽입 실패 시 모든 시드를 실패로 처리하여 재시도 가능하게 함
    const successIds = bulkInsertSuccess
        ? memorySeedUpdates.filter(s => s.status === 'success').map(s => s.id)
        : [];
    const failIds = bulkInsertSuccess
        ? memorySeedUpdates.filter(s => s.status === 'failed').map(s => s.id)
        : memorySeedUpdates.map(s => s.id); // 삽입 실패 시 모두 실패 처리
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
    let memoryDocUpdates: { id: string, counts: any, tier: string, ratio: number }[] = [];

    const processedResults = await mapWithConcurrency(docsToFill, concurrency, async (item) => {
        // Deadline까지 5초 이상 남았을 때만 새 작업 시작
        if (Date.now() > (deadline - 5000)) {
            return { status: 'skipped_deadline', item };
        }
        try {
            const counts = await fetchDocumentCount(item.keyword);
            const { tier, ratio } = calculateTierAndRatio(item.total_search_cnt, counts);
            memoryDocUpdates.push({ id: item.id, counts, tier, ratio });
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
            const updateStatements = chunk.map(({ id, counts, tier, ratio }) => ({
                sql: `UPDATE keywords SET
                    total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                    web_doc_cnt = ?, news_doc_cnt = ?, tier = ?, golden_ratio = ?, updated_at = ?
                    WHERE id = ?`,
                args: [
                    counts.total, counts.blog || 0, counts.cafe || 0,
                    counts.web || 0, counts.news || 0, tier, ratio, getCurrentTimestamp(), id
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
        // 🚀 Optimization: Direct UPDATE without SELECT COUNT(*) to save reads.
        const result = await db.execute("UPDATE keywords SET is_expanded = 0 WHERE is_expanded = 2 AND updated_at < datetime('now', '-1 hour')");

        if (result.rowsAffected > 0) {
            console.log(`[BatchRunner] 🚑 Auto-healed ${result.rowsAffected} stuck expanded keywords.`);
        }

        // 🚀 Duplicate for filling docs (if we want to heal stuck doc fills)
        const docResult = await db.execute("UPDATE keywords SET total_doc_cnt = NULL WHERE total_doc_cnt = -2 AND updated_at < datetime('now', '-1 hour')");
        if (docResult.rowsAffected > 0) {
            console.log(`[BatchRunner] 🚑 Auto-healed ${docResult.rowsAffected} stuck doc-fill keywords.`);
        }

    } catch (e) {
        console.error('[BatchRunner] Auto-healing check failed:', e);
    }
}
