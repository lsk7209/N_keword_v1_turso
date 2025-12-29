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

    // 기본 동시성 설정
    const baseExpandConcurrency = Math.min(50, Math.max(20, adKeyCount * 8));
    const baseFillConcurrency = Math.min(200, Math.max(50, searchKeyCount * 25));

    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, baseExpandConcurrency, baseExpandConcurrency);
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, baseFillConcurrency, baseFillConcurrency);

    // 배치 크기 설정
    const expandBatchBase = Math.max(50, EXPAND_CONCURRENCY * 5);
    const fillDocsBatchBase = Math.max(100, FILL_DOCS_CONCURRENCY * 5);

    const EXPAND_BATCH = clampInt(options.expandBatch, 1, 500, expandBatchBase);
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, 1000, fillDocsBatchBase);

    // 최소 검색량
    const MIN_SEARCH_VOLUME = Math.max(100, clampInt(options.minSearchVolume, 0, 50_000, 100));

    console.log(`[Batch] Mode: ${mode}, Keys(S/A): ${searchKeyCount}/${adKeyCount}, Task: ${task}`);
    console.log(`[Batch] Config: Expand(Batch:${EXPAND_BATCH}, Conc:${EXPAND_CONCURRENCY}), FillDocs(Batch:${FILL_DOCS_BATCH}, Conc:${FILL_DOCS_CONCURRENCY}), MaxRunMs: ${maxRunMs}`);

    // 결과 객체
    let result: any = {};

    // Expand 작업
    if (task === 'expand' || task === 'all') {
        const expandResult = await runExpandTask(EXPAND_BATCH, EXPAND_CONCURRENCY, MIN_SEARCH_VOLUME, deadline);
        if (expandResult) {
            result.expand = expandResult;
        }
    }

    // Fill Docs 작업
    if (task === 'fill_docs' || task === 'all') {
        const fillResult = await runFillDocsTask(FILL_DOCS_BATCH, FILL_DOCS_CONCURRENCY, deadline);
        if (fillResult) {
            result.fillDocs = fillResult;
        }
    }

    const end = Date.now();
    console.log(`[Batch] Completed in ${(end - start)}ms`);

    return result;
}

// Expand 작업 함수
async function runExpandTask(batchSize: number, concurrency: number, minSearchVolume: number, deadline: number) {
    const db = getTursoClient();

    // 시드 선점
    let seedsData: any[] = [];
    try {
        const claimResult = await db.execute({
            sql: `UPDATE keywords
                  SET is_expanded = 2, updated_at = ?
                  WHERE id IN (
                      SELECT id FROM keywords
                      WHERE (is_expanded = 0)
                         OR (is_expanded = 2)
                         OR (is_expanded = 1 AND updated_at < datetime('now', '-7 days'))
                      ORDER BY
                          CASE
                              WHEN is_expanded = 0 THEN 0
                              WHEN is_expanded = 2 THEN 1
                              WHEN is_expanded = 1 AND updated_at < datetime('now', '-7 days') THEN 2
                          END,
                          total_search_cnt DESC
                      LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [getCurrentTimestamp(), batchSize]
        });

        seedsData = claimResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));
    } catch (e: any) {
        console.error('[Batch] Expand Claim Failed:', e);
        return null;
    }

    if (!seedsData || seedsData.length === 0) return null;

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
            sql: `UPDATE keywords SET is_expanded = 1 WHERE id IN (${placeholders})`,
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
            r.status === 'fulfilled' ? `${r.seed.keyword} (+${r.saved})` : `${r.seed.keyword} (${r.status})`
        )
    };
}

// Fill Docs 작업 함수
async function runFillDocsTask(batchSize: number, concurrency: number, deadline: number) {
    const db = getTursoClient();

    // 대상 선점
    let docsToFill: any[] = [];
    try {
        const claimResult = await db.execute({
            sql: `UPDATE keywords
                  SET total_doc_cnt = -2
                  WHERE id IN (
                      SELECT id FROM keywords
                      WHERE total_doc_cnt IS NULL
                      ORDER BY total_search_cnt DESC
                      LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [batchSize]
        });

        docsToFill = claimResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));
    } catch (e: any) {
        console.error('[Batch] FillDocs Claim Failed:', e);
        return null;
    }

    if (!docsToFill || docsToFill.length === 0) return null;

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

    // 배치 업데이트
    if (memoryDocUpdates.length > 0) {
        const updateStatements = memoryDocUpdates.map(({ id, counts }) => ({
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
            console.log(`[Batch] ⚡ Bulk Doc Update: ${memoryDocUpdates.length} documents`);
        } catch (e) {
            console.error('[Batch] Bulk doc update failed:', e);
        }
    }

    const succeeded = processedResults.filter(r => r.status === 'fulfilled');
    const failed = processedResults.filter(r => r.status === 'rejected');
    const skipped = processedResults.filter(r => r.status === 'skipped_deadline');

    // 스킵된 항목 롤백
    if (skipped.length > 0) {
        const skippedIds = skipped.map(r => r.item.id);
        const placeholders = skippedIds.map(() => '?').join(',');
        await db.execute({
            sql: `UPDATE keywords SET total_doc_cnt = NULL WHERE id IN (${placeholders})`,
            args: skippedIds
        });
    }

    return {
        processed: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,
        details: processedResults.map((r: any) => {
            if (r.status === 'fulfilled') return `${r.item.keyword}: ${r.counts.total}`;
            if (r.status === 'rejected') return `${r.keyword}: ERROR`;
            return `${r.item.keyword}: SKIPPED`;
        })
    };
}