
import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount } from '@/utils/naver-api';
import { isBlacklisted } from '@/utils/blacklist';

export interface MiningResult {
    processed: number; // Count of fully processed items (with doc count)
    saved: number; // Total items saved to DB
    items: any[]; // The fully processed items to return to UI
}

export async function processSeedKeyword(
    seedKeyword: string,
    limitDocCount = 0,
    skipDocFetch = false,
    minSearchVolume = 1000,  // 기본값 1000, 수동 수집 시 0으로 설정 가능
    maxKeywords = 0          // 수집할 최대 키워드 수 (0 = 무제한)
): Promise<MiningResult> {
    const db = getTursoClient();
    console.log(`[MiningEngine] Processing seed: ${seedKeyword} (SkipDoc: ${skipDocFetch}, MinVolume: ${minSearchVolume}, MaxKeys: ${maxKeywords})`);

    // 1. Fetch Related Keywords (Ad API)
    let relatedList: any[] = [];
    try {
        relatedList = await fetchRelatedKeywords(seedKeyword);
    } catch (e: any) {
        console.error(`[MiningEngine] Ad API Error for ${seedKeyword}:`, e);
        throw e;
    }

    if (!relatedList || relatedList.length === 0) {
        return { processed: 0, saved: 0, items: [] };
    }

    // 2. Map & Basic Parse
    const candidates = relatedList.map((item: any) => {
        const parseCnt = (val: string | number) => {
            if (typeof val === 'string' && val.includes('<')) return 5;
            const num = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
            return isNaN(num) ? 0 : Math.round(num);
        };

        const parseFloat = (val: string | number) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.includes('<')) return 0.1;
            return Number(String(val).replace(/,/g, '')) || 0;
        };

        const pcCnt = parseCnt(item.monthlyPcQcCnt);
        const moCnt = parseCnt(item.monthlyMobileQcCnt);
        const total = Math.round(pcCnt + moCnt);

        const pcClickCnt = parseCnt(item.monthlyAvePcClkCnt);
        const moClickCnt = parseCnt(item.monthlyAveMobileClkCnt);
        const totalClickCnt = Math.round(pcClickCnt + moClickCnt);

        const pcCtr = parseFloat(item.monthlyAvePcCtr);
        const moCtr = parseFloat(item.monthlyAveMobileCtr);
        const totalCtr = (pcCtr + moCtr) / 2; // 평균 CTR

        return {
            keyword: item.relKeyword.replace(/\s+/g, ''),
            originalKeyword: item.relKeyword,
            pc_search_cnt: pcCnt,
            mo_search_cnt: moCnt,
            total_search_cnt: total,
            pc_click_cnt: pcClickCnt,
            mo_click_cnt: moClickCnt,
            click_cnt: totalClickCnt,
            pc_ctr: pcCtr,
            mo_ctr: moCtr,
            total_ctr: totalCtr,
            comp_idx: item.compIdx,
            pl_avg_depth: Math.round(parseCnt(item.plAvgDepth))
        };
    });

    // 3. Filter (Volume >= minSearchVolume & Blacklist)
    let filtered = candidates.filter((c: any) => c.total_search_cnt >= minSearchVolume && !isBlacklisted(c.originalKeyword));
    filtered.sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt);

    // 3b. Apply Max Limit
    if (maxKeywords > 0 && filtered.length > maxKeywords) {
        console.log(`[MiningEngine] Slicing results from ${filtered.length} to ${maxKeywords}`);
        filtered = filtered.slice(0, maxKeywords);
    }

    console.log(`[MiningEngine] Found ${relatedList.length} related, filtered to ${filtered.length} (min: ${minSearchVolume})`);

    let candidatesToProcess: any[] = [];
    let candidatesToSaveOnly: any[] = [];

    if (skipDocFetch) {
        candidatesToSaveOnly = filtered;
    } else {
        candidatesToProcess = limitDocCount > 0 ? filtered.slice(0, limitDocCount) : filtered;
        candidatesToSaveOnly = limitDocCount > 0 ? filtered.slice(limitDocCount) : [];
    }

    // 5. Fetch Document Counts (Parallel Batches) for candidatesToProcess
    // Optimized: Run ALL chunks in parallel instead of sequentially
    const BATCH_SIZE = 5;
    const allChunks = [];
    for (let i = 0; i < candidatesToProcess.length; i += BATCH_SIZE) {
        allChunks.push(candidatesToProcess.slice(i, i + BATCH_SIZE));
    }

    const allChunkResults = await Promise.all(
        allChunks.map(chunk =>
            Promise.all(chunk.map(async (cand: any) => {
                try {
                    const counts = await fetchDocumentCount(cand.originalKeyword);
                    return { ...cand, ...counts };
                } catch (e) {
                    console.error(`Failed doc count for ${cand.originalKeyword}:`, e);
                    return { ...cand, total: null }; // Mark as failed doc count
                }
            }))
        )
    );

    const processedResults = allChunkResults.flat();

    // 6. Bulk Upsert (Processed)
    const rowsToInsert = processedResults.map((r: any) => {
        // Golden Ratio: 검색량 / (블로그 + 카페 + 웹 문서수)
        // 뉴스는 제외 (SEO 경쟁 지표로 부적합)
        const viewDocCnt = (r.blog || 0) + (r.cafe || 0) + (r.web || 0);

        let ratio = 0;
        let tier = 'UNRANKED';

        if (viewDocCnt > 0) {
            ratio = r.total_search_cnt / viewDocCnt;

            // 등급 산정: 1~5등급 (1등급이 최고)
            if (viewDocCnt <= 100 && ratio > 5) {
                tier = '1등급';  // 초고효율: 문서 100개 이하 + 비율 5 이상
            } else if (ratio > 10) {
                tier = '2등급';  // 매우 높은 비율
            } else if (ratio > 5) {
                tier = '3등급';  // 높은 비율
            } else if (ratio > 1) {
                tier = '4등급';  // 보통 비율
            } else {
                tier = '5등급';  // 낮은 비율
            }
        } else if (r.total_search_cnt > 0 && r.total != null) {
            // No view competition? 1등급!
            tier = '1등급';
            ratio = 99.99;
        }

        return {
            keyword: r.originalKeyword,
            total_search_cnt: r.total_search_cnt,
            pc_search_cnt: r.pc_search_cnt,
            mo_search_cnt: r.mo_search_cnt,
            pc_click_cnt: r.pc_click_cnt,
            mo_click_cnt: r.mo_click_cnt,
            click_cnt: r.click_cnt,
            pc_ctr: r.pc_ctr,
            mo_ctr: r.mo_ctr,
            total_ctr: r.total_ctr,
            comp_idx: r.comp_idx,
            pl_avg_depth: r.pl_avg_depth,
            total_doc_cnt: r.total, // keep showing total docs
            blog_doc_cnt: r.blog || 0,
            cafe_doc_cnt: r.cafe || 0,
            web_doc_cnt: r.web || 0,
            news_doc_cnt: r.news || 0,
            golden_ratio: ratio,
            tier: tier,
            is_expanded: false
        };
    });

    // 6b. Bulk Upsert (Save Only / Deferred) if any
    // These will have null doc counts and 'UNRANKED'
    const rowsDeferred = candidatesToSaveOnly.map((r: any) => ({
        keyword: r.originalKeyword,
        total_search_cnt: r.total_search_cnt,
        pc_search_cnt: r.pc_search_cnt,
        mo_search_cnt: r.mo_search_cnt,
        pc_click_cnt: r.pc_click_cnt,
        mo_click_cnt: r.mo_click_cnt,
        click_cnt: r.click_cnt,
        pc_ctr: r.pc_ctr,
        mo_ctr: r.mo_ctr,
        total_ctr: r.total_ctr,
        comp_idx: r.comp_idx,
        pl_avg_depth: r.pl_avg_depth,
        total_doc_cnt: null, // Defer
        golden_ratio: 0,
        tier: 'UNRANKED',
        is_expanded: false
    }));

    // 6. Bulk Upsert
    let totalSaved = 0;

    // A. Rows with Document Counts (Complete Data) -> Batch Upsert (최적화)
    if (rowsToInsert.length > 0) {
        const now = getCurrentTimestamp();
        
        try {
            // 1. 모든 키워드를 한 번에 조회 (배치 읽기 최적화)
            const keywords = rowsToInsert.map(r => r.keyword);
            const placeholders = keywords.map(() => '?').join(',');
            const existingResult = await db.execute({
                sql: `SELECT id, keyword FROM keywords WHERE keyword IN (${placeholders})`,
                args: keywords
            });
            
            const existingMap = new Map<string, string>();
            existingResult.rows.forEach(row => {
                existingMap.set(row.keyword as string, row.id as string);
            });

            // 2. UPDATE와 INSERT 분리
            const updates: Array<{ id: string; row: any }> = [];
            const inserts: Array<any> = [];

            for (const row of rowsToInsert) {
                const existingId = existingMap.get(row.keyword);
                if (existingId) {
                    updates.push({ id: existingId, row });
                } else {
                    inserts.push(row);
                }
            }

            // 3. 배치 UPDATE (50개씩)
            if (updates.length > 0) {
                const batchSize = 50;
                for (let i = 0; i < updates.length; i += batchSize) {
                    const batch = updates.slice(i, i + batchSize);
                    const statements = batch.map(({ id, row }) => ({
                        sql: `UPDATE keywords SET 
                            total_search_cnt = ?, pc_search_cnt = ?, mo_search_cnt = ?,
                            pc_click_cnt = ?, mo_click_cnt = ?, click_cnt = ?,
                            pc_ctr = ?, mo_ctr = ?, total_ctr = ?,
                            comp_idx = ?, pl_avg_depth = ?,
                            total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                            web_doc_cnt = ?, news_doc_cnt = ?,
                            golden_ratio = ?, tier = ?, is_expanded = ?,
                            updated_at = ?
                            WHERE id = ?`,
                        args: [
                            row.total_search_cnt, row.pc_search_cnt, row.mo_search_cnt,
                            row.pc_click_cnt || 0, row.mo_click_cnt || 0, row.click_cnt || 0,
                            row.pc_ctr || 0, row.mo_ctr || 0, row.total_ctr || 0,
                            row.comp_idx || null, row.pl_avg_depth || 0,
                            row.total_doc_cnt, row.blog_doc_cnt || 0, row.cafe_doc_cnt || 0,
                            row.web_doc_cnt || 0, row.news_doc_cnt || 0,
                            row.golden_ratio, row.tier, row.is_expanded ? 1 : 0,
                            now, id
                        ]
                    }));
                    await db.batch(statements);
                }
                totalSaved += updates.length;
            }

            // 4. 배치 INSERT (50개씩)
            if (inserts.length > 0) {
                const batchSize = 50;
                for (let i = 0; i < inserts.length; i += batchSize) {
                    const batch = inserts.slice(i, i + batchSize);
                    const statements = batch.map(row => {
                        const id = generateUUID();
                        return {
                            sql: `INSERT INTO keywords (
                                id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                                pc_click_cnt, mo_click_cnt, click_cnt,
                                pc_ctr, mo_ctr, total_ctr,
                                comp_idx, pl_avg_depth,
                                total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                                web_doc_cnt, news_doc_cnt,
                                golden_ratio, tier, is_expanded,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                id, row.keyword, row.total_search_cnt, row.pc_search_cnt, row.mo_search_cnt,
                                row.pc_click_cnt || 0, row.mo_click_cnt || 0, row.click_cnt || 0,
                                row.pc_ctr || 0, row.mo_ctr || 0, row.total_ctr || 0,
                                row.comp_idx || null, row.pl_avg_depth || 0,
                                row.total_doc_cnt, row.blog_doc_cnt || 0, row.cafe_doc_cnt || 0,
                                row.web_doc_cnt || 0, row.news_doc_cnt || 0,
                                row.golden_ratio, row.tier, row.is_expanded ? 1 : 0,
                                now, now
                            ]
                        };
                    });
                    await db.batch(statements);
                }
                totalSaved += inserts.length;
            }
        } catch (e: any) {
            console.error(`DB Batch Upsert Error:`, e);
            throw new Error(`DB Save Failed (Complete): ${e.message}`);
        }
    }

    // B. Rows Deferred (Null Docs) -> Batch Insert Only (최적화)
    if (rowsDeferred.length > 0) {
        const now = getCurrentTimestamp();
        try {
            // 1. 모든 키워드를 한 번에 조회 (배치 읽기 최적화)
            const keywords = rowsDeferred.map(r => r.keyword);
            const placeholders = keywords.map(() => '?').join(',');
            const existingResult = await db.execute({
                sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
                args: keywords
            });
            
            const existingSet = new Set<string>();
            existingResult.rows.forEach(row => {
                existingSet.add(row.keyword as string);
            });

            // 2. 존재하지 않는 키워드만 필터링
            const toInsert = rowsDeferred.filter(row => !existingSet.has(row.keyword));

            // 3. 배치 INSERT (50개씩)
            if (toInsert.length > 0) {
                const batchSize = 50;
                for (let i = 0; i < toInsert.length; i += batchSize) {
                    const batch = toInsert.slice(i, i + batchSize);
                    const statements = batch.map(row => {
                        const id = generateUUID();
                        return {
                            sql: `INSERT INTO keywords (
                                id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                                pc_click_cnt, mo_click_cnt, click_cnt,
                                pc_ctr, mo_ctr, total_ctr,
                                comp_idx, pl_avg_depth,
                                total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                                web_doc_cnt, news_doc_cnt,
                                golden_ratio, tier, is_expanded,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                id, row.keyword, row.total_search_cnt, row.pc_search_cnt, row.mo_search_cnt,
                                row.pc_click_cnt || 0, row.mo_click_cnt || 0, row.click_cnt || 0,
                                row.pc_ctr || 0, row.mo_ctr || 0, row.total_ctr || 0,
                                row.comp_idx || null, row.pl_avg_depth || 0,
                                null, 0, 0, 0, 0,
                                0, row.tier, row.is_expanded ? 1 : 0,
                                now, now
                            ]
                        };
                    });
                    await db.batch(statements);
                }
                totalSaved += toInsert.length;
            }
        } catch (e: any) {
            console.error(`DB Batch Insert Error (Deferred):`, e);
            // Continue on error (ignore duplicates)
        }
    }

    return {
        processed: rowsToInsert.length,
        saved: totalSaved,
        items: [...rowsToInsert, ...rowsDeferred] // Return ALL items for UI
    };
}
