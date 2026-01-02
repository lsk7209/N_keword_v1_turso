import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword, bulkDeferredInsert } from '@/utils/mining-engine';
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
    const workers = new Array(Math.max(1, concurrency)).fill(null).map(async () => {
        while (true) {
            const idx = nextIndex++;
            if (idx >= items.length) return;
            // 🚀 Stability Optimization: Small jitter between requests to avoid burst 429s
            if (nextIndex > concurrency) {
                await new Promise(r => setTimeout(r, Math.random() * 50 + 10));
            }
            results[idx] = await worker(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return results;
}

export async function runMiningBatch(options: MiningBatchOptions = {}) {
    const db = getTursoClient();

    // 타임스탬프 로깅
    const start = Date.now();
    console.log('[Batch] Starting Parallel Mining Batch...');

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

    // 🚀 획기적 최적화: API 키 수를 최대한 활용
    // AD 14개: 분당 Rate Limit 있으므로 빠른 라운드 로빈으로 키당 15회 요청 가능
    // SEARCH 30개: 일일 25,000회 제한이므로 매우 여유로움
    // ═══════════════════════════════════════════════════════════════
    const baseExpandConcurrency = Math.min(100, Math.max(20, adKeyCount * 5)); // Higher concurrency often leads to 429s on AD API
    const baseFillConcurrency = Math.min(500, Math.max(100, searchKeyCount * 15));

    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, 200, baseExpandConcurrency);
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, 500, baseFillConcurrency);

    // 🚀 배치 크기: 동시성의 10배까지 허용 (대량 처리)
    const expandBatchBase = Math.max(100, EXPAND_CONCURRENCY * 10);
    const fillDocsBatchBase = Math.max(200, FILL_DOCS_CONCURRENCY * 5);

    const EXPAND_BATCH = clampInt(options.expandBatch, 1, 2000, expandBatchBase);
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, 2500, fillDocsBatchBase);

    // 최소 검색량
    const MIN_SEARCH_VOLUME = Math.max(100, clampInt(options.minSearchVolume, 0, 50_000, 100));

    console.log(`[Batch] Mode: ${mode}, Keys(S/A): ${searchKeyCount}/${adKeyCount}, Task: ${task}`);
    console.log(`[Batch] Config: Expand(Batch:${EXPAND_BATCH}, Conc:${EXPAND_CONCURRENCY}), FillDocs(Batch:${FILL_DOCS_BATCH}, Conc:${FILL_DOCS_CONCURRENCY}), MaxRunMs: ${maxRunMs}`);

    // 결과 객체
    let result: any = {};

    // 🚀 Volume Optimization: Run Expand and FillDocs in Parallel
    const tasks: Promise<void>[] = [];

    if (task === 'expand' || task === 'all') {
        tasks.push(runExpandTask(EXPAND_BATCH, EXPAND_CONCURRENCY, MIN_SEARCH_VOLUME, deadline).then(res => {
            if (res) result.expand = res;
        }));
    }

    if (task === 'fill_docs' || task === 'all') {
        tasks.push(runFillDocsTask(FILL_DOCS_BATCH, FILL_DOCS_CONCURRENCY, deadline).then(res => {
            if (res) result.fillDocs = res;
        }));
    }

    await Promise.all(tasks);

    const end = Date.now();
    console.log(`[Batch] Completed in ${(end - start)}ms`);

    return result;
}

// Expand 작업 함수
async function runExpandTask(batchSize: number, concurrency: number, minSearchVolume: number, deadline: number) {
    const db = getTursoClient();

    // 🚀 Read/Write Optimization: Use batch for atomic claim
    let seedsData: any[] = [];
    try {
        const selectResult = await db.execute({
            sql: `SELECT id, keyword, total_search_cnt FROM keywords
                  WHERE (is_expanded = 0)
                     OR (is_expanded = 2 AND updated_at < datetime('now', '-2 hours')) -- Retry stuck ones
                     OR (is_expanded = 1 AND updated_at < datetime('now', '-7 days'))
                  ORDER BY
                      CASE
                          WHEN is_expanded = 0 THEN 0
                          WHEN is_expanded = 2 THEN 1
                          WHEN is_expanded = 1 THEN 2
                      END,
                      total_search_cnt DESC
                  LIMIT ?`,
            args: [batchSize]
        });

        seedsData = selectResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        if (seedsData.length > 0) {
            const ids = seedsData.map(s => s.id);
            const placeholders = ids.map(() => '?').join(',');

            // Mark as processing in one batch call alongside the previous read concept?
            // Since Turso is remote, we minimize round trips.
            await db.execute({
                sql: `UPDATE keywords SET is_expanded = 2, updated_at = ? WHERE id IN (${placeholders})`,
                args: [getCurrentTimestamp(), ...ids]
            });
            console.log(`[Expand] Claimed ${seedsData.length} seeds`);
        }
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
    let memoryKeywordBuffer: any[] = [];
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
            console.error(`[Batch] Seed Failed: ${seed.keyword} - ${e.message}`);
            memorySeedUpdates.push({ id: seed.id, status: 'failed' });
            return { status: 'rejected', seed, error: e.message };
        }
    });

    // 배치 삽입
    if (memoryKeywordBuffer.length > 0) {
        try {
            await bulkDeferredInsert(memoryKeywordBuffer);
            console.log(`[Batch] ⚡ Deferred Bulk Insert: ${memoryKeywordBuffer.length} keywords`);
        } catch (e) {
            console.error('[Batch] Bulk insert failed:', e);
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
        totalSaved: succeeded.reduce((sum, r: any) => (sum + (r.saved || 0)), 0),
        details: expandResults.map((r: any) =>
            r.status === 'fulfilled' ? `${r.seed.keyword} (+${r.saved})` :
                r.status === 'rejected' ? `${r.seed.keyword} (rejected: ${r.error})` :
                    `${r.seed.keyword} (${r.status})`
        )
    };
}

// Fill Docs 작업 함수
async function runFillDocsTask(batchSize: number, concurrency: number, deadline: number) {
    const db = getTursoClient();

    // 🚀 Read/Write Optimization: Atomic claim
    let docsToFill: any[] = [];
    try {
        const selectResult = await db.execute({
            sql: `SELECT id, keyword, total_search_cnt FROM keywords
                  WHERE (total_doc_cnt IS NULL)
                     OR (total_doc_cnt = -2 AND updated_at < datetime('now', '-2 hours')) -- Retry stuck ones
                  ORDER BY total_search_cnt DESC
                  LIMIT ?`,
            args: [batchSize]
        });

        docsToFill = selectResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        if (docsToFill.length > 0) {
            const ids = docsToFill.map(d => d.id);
            const placeholders = ids.map(() => '?').join(',');
            await db.execute({
                sql: `UPDATE keywords SET total_doc_cnt = -2, updated_at = ? WHERE id IN (${placeholders})`,
                args: [getCurrentTimestamp(), ...ids]
            });
            console.log(`[FillDocs] Claimed ${docsToFill.length} keywords`);
        }
    } catch (err: any) {
        console.error('[FillDocs] Failed to claim keywords:', err.message);
        return null;
    }

    if (docsToFill.length === 0) {
        console.log('[FillDocs] No keywords need document count');
        return {
            processed: 0,
            errors: []
        };
    }

    console.log(`[Batch] FILL_DOCS: Claimed ${docsToFill.length} items (Concurrency ${concurrency})`);

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
            console.error(`[Batch] Error filling ${item.keyword}: ${e.message}`);
            return { status: 'rejected', keyword: item.keyword, error: e.message };
        }
    });

    // 배치 업데이트 (안전하게 50개씩 청크)
    if (memoryDocUpdates.length > 0) {
        const CHUNK_SIZE = 50;
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
                console.log(`[Batch] ⚡ Bulk Doc Update: chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} items)`);
            } catch (e: any) {
                console.error(`[Batch] Bulk doc update failed for chunk starting at ${i}:`, e.message);
            }
        }
    }

    const succeeded = processedResults.filter(r => r.status === 'fulfilled');
    const failed = processedResults.filter(r => r.status === 'rejected');
    const skipped = processedResults.filter(r => r.status === 'skipped_deadline');

    // 🔴 실패(rejected) 또는 스킵(skipped) 항목 롤백 (매우 중요: -2 상태 고착 방지)
    const rollbackIds = [
        ...failed.map(r => r.item?.id).filter(Boolean),
        ...skipped.map(r => r.item?.id).filter(Boolean)
    ];

    if (rollbackIds.length > 0) {
        console.log(`[Batch] 🔄 Rolling back ${rollbackIds.length} failed/skipped items to NULL`);
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
                console.error('[Batch] Rollback failed:', err.message);
            }
        }
    }

    return {
        processed: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,
        details: processedResults.map((r: any) => {
            if (r.status === 'fulfilled') return `${r.item.keyword}: ${r.counts.total}`;
            if (r.status === 'rejected') return `${r.keyword || r.item?.keyword}: ERROR`;
            return `${r.item?.keyword}: SKIPPED`;
        })
    };
}