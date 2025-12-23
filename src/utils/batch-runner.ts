
import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword } from '@/utils/mining-engine';
import { fetchDocumentCount } from '@/utils/naver-api';

type MiningMode = 'NORMAL' | 'TURBO';
type MiningTask = 'all' | 'expand' | 'fill_docs';

export interface MiningBatchOptions {
    task?: MiningTask;
    mode?: MiningMode; // optional override
    seedCount?: number;
    expandBatch?: number;
    expandConcurrency?: number;
    fillDocsBatch?: number;
    fillDocsConcurrency?: number; // keywords concurrently fetching doc counts
    maxRunMs?: number; // hard deadline to avoid Vercel timeout (default: 55s)
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

    // 터보모드 확인 (API 키 최대 활용을 위한 배치 크기 조정)
    const settingResult = await db.execute({
        sql: 'SELECT value FROM settings WHERE key = ?',
        args: ['mining_mode']
    });
    const setting = settingResult.rows.length > 0 ? { value: settingResult.rows[0].value } : null;

    // JSONB 값 파싱 (getMiningMode와 동일한 로직)
    let mode: MiningMode = 'TURBO'; // 기본값은 TURBO
    if (setting) {
        const rawValue = (setting as any)?.value;
        if (typeof rawValue === 'string') {
            mode = rawValue.replace(/^"|"$/g, '').toUpperCase() as MiningMode;
        } else {
            mode = String(rawValue).toUpperCase() as MiningMode;
        }
        if (mode !== 'NORMAL' && mode !== 'TURBO') {
            mode = 'TURBO'; // 기본값은 TURBO
        }
    }
    if (options.mode === 'NORMAL' || options.mode === 'TURBO') {
        mode = options.mode;
    }
    const isTurboMode = mode === 'TURBO';

    const task: MiningTask = (options.task === 'expand' || options.task === 'fill_docs' || options.task === 'all')
        ? options.task
        : 'all';

    const maxRunMs = clampInt(options.maxRunMs, 10_000, 58_000, 55_000);
    const deadline = start + maxRunMs;

    // 터보모드: API 키 최대 활용 (검색광고 API 4개=10000호출, 문서수 API 9개)
    // 일반 모드: 안정적인 수집 (5분마다 GitHub Actions)
    const SEED_COUNT = clampInt(options.seedCount, 0, 50, isTurboMode ? 20 : 5); // turbo default raised
    const EXPAND_BATCH = clampInt(options.expandBatch, 1, 300, isTurboMode ? 100 : 20);
    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, 16, isTurboMode ? 8 : 2); // match 4 AD keys (can reuse)
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, 300, isTurboMode ? 100 : 30); // 터보: 100개, 일반: 30개
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, 32, isTurboMode ? 24 : 6); // 터보: 24개 (29개 API 키 최적화)
    // 최소 검색량 1000 강제 (쿼리 파라미터로 0이 전달되어도 최소 1000 적용)
    const MIN_SEARCH_VOLUME = Math.max(1000, clampInt(options.minSearchVolume, 0, 50_000, 1000));

    console.log(`[Batch] Mode: ${isTurboMode ? 'TURBO (Max API Usage)' : 'NORMAL'}, Task: ${task}, ExpandBatch: ${EXPAND_BATCH}, ExpandConcurrency: ${EXPAND_CONCURRENCY}, FillDocs: ${FILL_DOCS_BATCH}, FillConcurrency: ${FILL_DOCS_CONCURRENCY}, MaxRunMs: ${maxRunMs}`);

    // === Task 1: EXPAND (Keywords Expansion) ===
    const taskExpand = async () => {
        if (task === 'fill_docs') return null;

        const seedsResult = await db.execute({
            sql: `SELECT id, keyword, total_search_cnt FROM keywords 
                  WHERE is_expanded = 0 AND total_search_cnt >= ? 
                  ORDER BY total_search_cnt DESC 
                  LIMIT ?`,
            args: [MIN_SEARCH_VOLUME, isTurboMode ? 500 : 200]
        });

        const seedsData = seedsResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        if (!seedsData || seedsData.length === 0) return null;

        // 검색량 상위 우선 선택 (랜덤 대신)
        const seeds = seedsData.slice(0, EXPAND_BATCH);

        console.log(`[Batch] EXPAND: Processing up to ${seeds.length} seeds (Concurrency ${EXPAND_CONCURRENCY}, Deadline in ${(deadline - Date.now())}ms, min: ${MIN_SEARCH_VOLUME})`);
        let stopDueToDeadline = false;

        const expandResults = await mapWithConcurrency(seeds, EXPAND_CONCURRENCY, async (seed) => {
            if (Date.now() > (deadline - 2500)) {
                stopDueToDeadline = true;
                return { status: 'skipped_deadline', seed: seed.keyword };
            }

            // Optimistic lock (best-effort): claim the seed so parallel invocations don't duplicate work
            const lockResult = await db.execute({
                sql: 'UPDATE keywords SET is_expanded = 1 WHERE id = ? AND is_expanded = 0',
                args: [seed.id]
            });

            if (lockResult.rowsAffected === 0) return { status: 'skipped', seed: seed.keyword };

            try {
                const res = await processSeedKeyword(seed.keyword, 0, true, MIN_SEARCH_VOLUME);
                // Mark confirmed
                await db.execute({
                    sql: 'UPDATE keywords SET is_expanded = 1 WHERE id = ?',
                    args: [seed.id]
                });
                return { status: 'fulfilled', seed: seed.keyword, saved: res.saved };
            } catch (e: any) {
                console.error(`[Batch] Seed Failed: ${seed.keyword} - ${e.message}`);
                await db.execute({
                    sql: 'UPDATE keywords SET is_expanded = 1 WHERE id = ?',
                    args: [seed.id]
                });
                return { status: 'rejected', seed: seed.keyword, error: e.message };
            }
        });

        const succeeded = expandResults.filter(r => r.status === 'fulfilled');
        return {
            processedSeeds: seeds.length,
            totalSaved: succeeded.reduce((sum, r: any) => (sum + (r.saved || 0)), 0),
            stoppedDueToDeadline: stopDueToDeadline,
            details: expandResults.map((r: any) =>
                r.status === 'fulfilled' ? `${r.seed} (+${r.saved})` : `${r.seed} (${r.status})`
            )
        };
    };

    // === Task 2: FILL_DOCS (Document Counts) ===
    const taskFillDocs = async () => {
        if (task === 'expand') return null;

        // 터보모드: API 키 최대 활용을 위해 배치 크기 증가
        const BATCH_SIZE = FILL_DOCS_BATCH;
        const CONCURRENCY = FILL_DOCS_CONCURRENCY;

        const docsResult = await db.execute({
            sql: `SELECT id, keyword, total_search_cnt FROM keywords 
                  WHERE total_doc_cnt IS NULL 
                  ORDER BY total_search_cnt DESC 
                  LIMIT ?`,
            args: [BATCH_SIZE]
        });

        const docsToFill = docsResult.rows.map(row => ({
            id: row.id as string,
            keyword: row.keyword as string,
            total_search_cnt: row.total_search_cnt as number
        }));

        if (!docsToFill || docsToFill.length === 0) return null;

        console.log(`[Batch] FILL_DOCS: Processing ${docsToFill.length} items (Concurrency ${CONCURRENCY}, Deadline in ${(deadline - Date.now())}ms)`);
        let stopDueToDeadline = false;

        const processedResults = await mapWithConcurrency(docsToFill, CONCURRENCY, async (item) => {
            // Keep a safety margin to avoid Vercel hard timeout.
            if (Date.now() > (deadline - 2500)) {
                stopDueToDeadline = true;
                return { status: 'skipped_deadline', item };
            }
            try {
                const counts = await fetchDocumentCount(item.keyword);
                return { status: 'fulfilled', item, counts };
            } catch (e: any) {
                console.error(`[Batch] Error filling ${item.keyword}: ${e.message}`);
                return { status: 'rejected', keyword: item.keyword, error: e.message };
            }
        });

        const succeeded = processedResults.filter(r => r.status === 'fulfilled');
        const failed = processedResults.filter(r => r.status === 'rejected');

        // Success Updates
        const successUpdates = succeeded.map((res: any) => {
            const { item, counts } = res;
            const viewDocCnt = (counts.blog || 0) + (counts.cafe || 0) + (counts.web || 0);
            let ratio = 0;
            let tier = 'UNRANKED';

            if (viewDocCnt > 0) {
                ratio = item.total_search_cnt / viewDocCnt;
                if (viewDocCnt <= 100 && ratio > 5) tier = '1등급';
                else if (ratio > 10) tier = '2등급';
                else if (ratio > 5) tier = '3등급';
                else if (ratio > 1) tier = '4등급';
                else tier = '5등급';
            } else if (item.total_search_cnt > 0) {
                tier = '1등급';
                ratio = 99.99;
            }

            return {
                id: item.id,
                keyword: item.keyword,
                total_search_cnt: item.total_search_cnt,
                total_doc_cnt: counts.total,
                blog_doc_cnt: counts.blog,
                cafe_doc_cnt: counts.cafe,
                web_doc_cnt: counts.web,
                news_doc_cnt: counts.news,
                golden_ratio: ratio,
                tier: tier,
                updated_at: new Date().toISOString()
            };
        });

        // Failure Updates (Mark as Error to prevent reuse)
        const failureUpdates = failed.map((res: any) => {
            const { keyword, error } = res;
            // Find original item ID from docsToFill
            const original = docsToFill.find(d => d.keyword === keyword);
            if (!original) return null;

            return {
                id: original.id,
                keyword: keyword,
                total_search_cnt: original.total_search_cnt || 0,
                total_doc_cnt: -1, // Error Flag
                blog_doc_cnt: 0,
                cafe_doc_cnt: 0,
                web_doc_cnt: 0,
                news_doc_cnt: 0,
                golden_ratio: 0,
                tier: 'ERROR',
                updated_at: new Date().toISOString()
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        const updates = [...successUpdates, ...failureUpdates];
        const now = getCurrentTimestamp();

        if (updates.length > 0) {
            try {
                for (const update of updates) {
                    await db.execute({
                        sql: `UPDATE keywords SET 
                            total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                            web_doc_cnt = ?, news_doc_cnt = ?,
                            golden_ratio = ?, tier = ?, updated_at = ?
                            WHERE id = ?`,
                        args: [
                            update.total_doc_cnt,
                            update.blog_doc_cnt || 0,
                            update.cafe_doc_cnt || 0,
                            update.web_doc_cnt || 0,
                            update.news_doc_cnt || 0,
                            update.golden_ratio,
                            update.tier,
                            now,
                            update.id
                        ]
                    });
                }
            } catch (upsertError: any) {
                console.error('[Batch] Bulk Upsert Error:', upsertError);
                return {
                    processed: 0,
                    failed: docsToFill.length,
                    errors: [`Bulk Save Failed: ${upsertError.message}`]
                };
            }
        }

        return {
            processed: successUpdates.length,
            failed: failed.length,
            stoppedDueToDeadline: stopDueToDeadline,
            errors: failed.slice(0, 3).map((f: any) => `${f.keyword}: ${f.error}`)
        };
    };

    try {
        // Execute Both Tasks in Parallel
        const [expandResult, fillDocsResult] = await Promise.all([
            taskExpand(),
            taskFillDocs()
        ]);

        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[Batch] Completed in ${duration}s`);

        return {
            success: true,
            mode,
            task,
            expand: expandResult,
            fillDocs: fillDocsResult
        };

    } catch (e: any) {
        console.error('Batch Error:', e);
        return { success: false, error: e.message };
    }
}
