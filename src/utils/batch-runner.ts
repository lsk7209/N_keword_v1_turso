
import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';
import { processSeedKeyword } from '@/utils/mining-engine';
import { fetchDocumentCount } from '@/utils/naver-api';
import { keyManager } from '@/utils/key-manager';

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

    // 🚀 터보모드: DB 읽기 최소화 - options.mode 우선, 없으면 기본값 TURBO 사용
    // settings 테이블 조회는 선택적으로만 수행 (DB 읽기 1회 절약)
    let mode: MiningMode = 'TURBO'; // 기본값은 TURBO (대량 수집 최적화)
    let isTurboMode = true;
    
    if (options.mode === 'NORMAL' || options.mode === 'TURBO') {
        mode = options.mode;
        isTurboMode = mode === 'TURBO';
    } else {
        // options.mode가 없을 때만 DB 조회 (최소화)
        try {
            const settingResult = await db.execute({
                sql: 'SELECT value FROM settings WHERE key = ?',
                args: ['mining_mode']
            });
            if (settingResult.rows.length > 0) {
                const rawValue = (settingResult.rows[0] as any).value;
                if (typeof rawValue === 'string') {
                    mode = rawValue.replace(/^"|"$/g, '').toUpperCase() as MiningMode;
                } else {
                    mode = String(rawValue).toUpperCase() as MiningMode;
                }
                if (mode !== 'NORMAL' && mode !== 'TURBO') {
                    mode = 'TURBO';
                }
                isTurboMode = mode === 'TURBO';
            }
        } catch (e) {
            // DB 조회 실패 시 기본값 TURBO 사용
            console.warn('[Batch] Failed to read mining_mode from DB, using TURBO default');
        }
    }

    const task: MiningTask = (options.task === 'expand' || options.task === 'fill_docs' || options.task === 'all')
        ? options.task
        : 'all';

    // 🚀 터보모드: 최대 실행 시간 확대 (55초 → 58초)로 더 많은 처리
    const maxRunMs = clampInt(options.maxRunMs, 10_000, 58_000, 58_000);
    const deadline = start + maxRunMs;

    // 터보모드: API 키 수에 따른 동적 확장 (Aggressive)
    const searchKeyCount = keyManager.getKeyCount('SEARCH');
    const adKeyCount = keyManager.getKeyCount('AD');

    // 🚀 터보모드: 최대 성능을 위한 공격적 설정 (API 키 최대 활용)
    // AD Key: 개당 8-10배 (터보모드에서는 최대한 활용)
    // 최소 20개, 키가 많을수록 증가 (최대 제한 없음)
    let baseExpandConcurrency = isTurboMode 
        ? Math.max(20, adKeyCount * 10)  // 터보: 키당 10배, 최소 20 (5배 → 10배로 증가)
        : Math.max(4, adKeyCount * 2);  // 일반: 키당 2배, 최소 4
    
    // Search Key: 개당 10-12배 (터보모드에서는 최대한 활용)
    // 최소 50개, 키가 많을수록 증가 (최대 제한 없음)
    let baseFillConcurrency = isTurboMode
        ? Math.max(50, searchKeyCount * 12)  // 터보: 키당 12배, 최소 50 (6배 → 12배로 증가)
        : Math.max(20, searchKeyCount * 3); // 일반: 키당 3배, 최소 20

    console.log(`[Batch] 🚀 TURBO Mode: Key-based concurrency: AD keys=${adKeyCount} → expand=${baseExpandConcurrency}, SEARCH keys=${searchKeyCount} → fill=${baseFillConcurrency}`);

    const SEED_COUNT = clampInt(options.seedCount, 0, 50, isTurboMode ? 20 : 5);

    // 🚀 터보모드: 동시성 제한을 크게 확대 (API 키 최대 활용)
    // EXPAND: 최대 500까지 허용 (터보모드에서는 더 많은 동시 처리)
    const EXPAND_CONCURRENCY = clampInt(options.expandConcurrency, 1, isTurboMode ? 500 : 100, baseExpandConcurrency);
    // FILL_DOCS: 최대 1000까지 허용 (터보모드에서는 더 많은 동시 처리)
    const FILL_DOCS_CONCURRENCY = clampInt(options.fillDocsConcurrency, 1, isTurboMode ? 1000 : 400, baseFillConcurrency);

    // 🚀 터보모드: 배치 크기를 최대한 크게 설정 (API 키 최대 활용)
    // EXPAND: 동시성의 15-20배 (터보모드에서는 더 많은 시드 처리)
    const expandBatchBase = isTurboMode
        ? Math.max(200, baseExpandConcurrency * 20)  // 터보: 20배, 최소 200 (12배 → 20배로 증가)
        : Math.max(50, baseExpandConcurrency * 8);   // 일반: 8배, 최소 50
    
    // FILL_DOCS: 동시성의 15-20배 (터보모드에서는 더 많은 키워드 처리)
    const fillDocsBatchBase = isTurboMode
        ? Math.max(500, baseFillConcurrency * 20)  // 터보: 20배, 최소 500 (10배 → 20배로 증가)
        : Math.max(100, baseFillConcurrency * 5);  // 일반: 5배, 최소 100

    // 🚀 터보모드: 배치 크기 제한을 크게 확대 (API 키 최대 활용)
    const EXPAND_BATCH = clampInt(options.expandBatch, 1, isTurboMode ? 5000 : 1000, expandBatchBase);
    const FILL_DOCS_BATCH = clampInt(options.fillDocsBatch, 1, isTurboMode ? 20000 : 5000, fillDocsBatchBase);

    // 최소 검색량 1000 강제 (쿼리 파라미터로 0이 전달되어도 최소 1000 적용)
    const MIN_SEARCH_VOLUME = Math.max(1000, clampInt(options.minSearchVolume, 0, 50_000, 1000));

    console.log(`[Batch] Mode: ${isTurboMode ? 'TURBO' : 'NORMAL'}, Keys(S/A): ${searchKeyCount}/${adKeyCount}, Task: ${task}`);
    console.log(`[Batch] Config: Expand(Batch:${EXPAND_BATCH}, Conc:${EXPAND_CONCURRENCY}), FillDocs(Batch:${FILL_DOCS_BATCH}, Conc:${FILL_DOCS_CONCURRENCY}), MaxRunMs: ${maxRunMs}`);

    // === Task 1: EXPAND (Keywords Expansion) ===
    const taskExpand = async () => {
        if (task === 'fill_docs') return null;

        // 🚀 Atomic Claim: 한 번의 DB 호출로 배치를 선점하고 데이터를 가져옴 (is_expanded = 2 Processing)
        // Turso/SQLite 'UPDATE ... RETURNING' 지원 활용
        // 🚀 수정: is_expanded = 2 (Processing) 상태로 남은 키워드도 재처리 대상에 포함
        let seedsData: any[] = [];
        try {
            const claimResult = await db.execute({
                sql: `UPDATE keywords
                      SET is_expanded = 2
                      WHERE id IN (
                          SELECT id FROM keywords
                          WHERE (is_expanded = 0 OR is_expanded = 2) AND total_search_cnt >= ?
                          ORDER BY total_search_cnt DESC
                          LIMIT ?
                      )
                      RETURNING id, keyword, total_search_cnt`,
                args: [MIN_SEARCH_VOLUME, EXPAND_BATCH]
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

        console.log(`[Batch] EXPAND: Claimed ${seedsData.length} seeds (Concurrency ${EXPAND_CONCURRENCY}, Deadline in ${(deadline - Date.now())}ms)`);
        let stopDueToDeadline = false;

        const expandResults = await mapWithConcurrency(seedsData, EXPAND_CONCURRENCY, async (seed) => {
            // 🚀 터보모드: deadline 체크 완화 (2500ms → 1000ms)로 더 많은 시드 처리
            if (Date.now() > (deadline - 1000)) {
                stopDueToDeadline = true;
                return { status: 'skipped_deadline', seed };
            }

            try {
                const res = await processSeedKeyword(seed.keyword, 0, true, MIN_SEARCH_VOLUME);
                return { status: 'fulfilled', seed, saved: res.saved };
            } catch (e: any) {
                console.error(`[Batch] Seed Failed: ${seed.keyword} - ${e.message}`);
                return { status: 'rejected', seed, error: e.message };
            }
        });

        // 후처리: 성공/실패 상태 업데이트 (Batch Update)
        const succeededIds = expandResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.seed.id);

        const failedIds = expandResults
            .filter(r => r.status === 'rejected')
            // 실패 시 0으로 되돌려 재시도할지, 아니면 1(확장완료/실패)로 처리할지?
            // 반복적인 실패 방지를 위해 일단 1(완료 간주)로 처리하거나 3(에러) 등 별도 상태가 좋으나
            // 기존 로직 유지: is_expanded=1
            .map(r => r.seed.id);

        const allIdsToMarkDone = [...succeededIds, ...failedIds];

        // 🚀 상태 일괄 업데이트 (1번의 DB 호출)
        if (allIdsToMarkDone.length > 0) {
            try {
                // SQLite LIMIT on UPDATE is optional, standard UPDATE IN is safer
                const placeholders = allIdsToMarkDone.map(() => '?').join(',');
                await db.execute({
                    sql: `UPDATE keywords SET is_expanded = 1 WHERE id IN (${placeholders})`,
                    args: allIdsToMarkDone
                });
            } catch (e) {
                console.error('[Batch] Failed to mark seeds as expanded:', e);
            }
        }

        // is_expanded=2(Processing) 상태로 남은(데드라인 스킵 등) 항목들은?
        // 다음 실행 시 자동으로 처리되거나, 2 상태인건 재시도 로직 필요.
        // 현재 로직상 스킵된 건 그대로 2로 남음. 
        // 롤백 필요: 스킵된 항목은 0으로 되돌려야 함.
        const skippedIds = expandResults
            .filter(r => r.status === 'skipped_deadline')
            .map(r => r.seed.id);

        if (skippedIds.length > 0) {
            try {
                const placeholders = skippedIds.map(() => '?').join(',');
                await db.execute({
                    sql: `UPDATE keywords SET is_expanded = 0 WHERE id IN (${placeholders})`,
                    args: skippedIds
                });
            } catch (e) {
                console.error('[Batch] Failed to rollback skipped seeds:', e);
            }
        }

        const succeeded = expandResults.filter(r => r.status === 'fulfilled');
        return {
            processedSeeds: seedsData.length,
            totalSaved: succeeded.reduce((sum, r: any) => (sum + (r.saved || 0)), 0),
            stoppedDueToDeadline: stopDueToDeadline,
            details: expandResults.map((r: any) =>
                r.status === 'fulfilled' ? `${r.seed.keyword} (+${r.saved})` : `${r.seed.keyword} (${r.status})`
            )
        };
    };

    // === Task 2: FILL_DOCS (Document Counts) ===
    const taskFillDocs = async () => {
        if (task === 'expand') return null;

        const BATCH_SIZE = FILL_DOCS_BATCH;
        const CONCURRENCY = FILL_DOCS_CONCURRENCY;

        // 🚀 Atomic Claim: 문서 수집 대상 선점 (-2: Processing)
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
                args: [BATCH_SIZE]
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

        console.log(`[Batch] FILL_DOCS: Claimed ${docsToFill.length} items (Concurrency ${CONCURRENCY}, Deadline in ${(deadline - Date.now())}ms)`);
        let stopDueToDeadline = false;

        const processedResults = await mapWithConcurrency(docsToFill, CONCURRENCY, async (item) => {
            // 🚀 터보모드: deadline 체크 완화 (2500ms → 1000ms)로 더 많은 키워드 처리
            if (Date.now() > (deadline - 1000)) {
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

        // 스킵된 항목은 -2 -> NULL로 롤백해야 다시 잡힘
        const skipped = processedResults.filter(r => r.status === 'skipped_deadline');
        if (skipped.length > 0) {
            const skippedIds = skipped.map(r => r.item.id);
            try {
                const placeholders = skippedIds.map(() => '?').join(',');
                await db.execute({
                    sql: `UPDATE keywords SET total_doc_cnt = NULL WHERE id IN (${placeholders})`,
                    args: skippedIds
                });
            } catch (e) {
                console.error('[Batch] Error rolling back skipped docs:', e);
            }
        }

        // Success Updates (will overwrite -2 with real count)
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

        // Failure Updates (Error Flag: -1)
        const failureUpdates = failed.map((res: any) => {
            const { keyword, error } = res;
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
            let transactionStarted = false;
            try {
                await db.execute({ sql: 'BEGIN TRANSACTION' });
                transactionStarted = true;
                // 🚀 터보모드: 배치 크기 대폭 증가 (200 → 1000)로 DB 호출 최소화
                const batchSize = 1000; // DB 호출 횟수 80% 감소
                for (let i = 0; i < updates.length; i += batchSize) {
                    const batch = updates.slice(i, i + batchSize);
                    const statements = batch.map(update => ({
                        sql: `INSERT OR REPLACE INTO keywords (
                            id, total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                            web_doc_cnt, news_doc_cnt, golden_ratio, tier, updated_at
                        ) VALUES (
                            (SELECT id FROM keywords WHERE id = ?),
                            ?, ?, ?, ?, ?, ?, ?, ?
                        )`,
                        args: [
                            update.id,
                            update.total_doc_cnt,
                            update.blog_doc_cnt || 0,
                            update.cafe_doc_cnt || 0,
                            update.web_doc_cnt || 0,
                            update.news_doc_cnt || 0,
                            update.golden_ratio,
                            update.tier,
                            now
                        ]
                    }));

                    await db.batch(statements);
                }
                await db.execute({ sql: 'COMMIT' });
            } catch (upsertError: any) {
                // Only rollback if transaction was actually started
                if (transactionStarted) {
                    try {
                        await db.execute({ sql: 'ROLLBACK' });
                    } catch (rollbackError: any) {
                        // Ignore rollback errors (transaction might already be rolled back)
                        console.error('[Batch] Rollback error (ignored):', rollbackError.message);
                    }
                }
                console.error('[Batch] Transaction UPSERT Error:', upsertError);
                return {
                    processed: 0,
                    failed: docsToFill.length,
                    errors: [`Transaction UPSERT Failed: ${upsertError.message}`]
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
