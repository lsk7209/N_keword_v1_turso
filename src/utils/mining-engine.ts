
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
        console.log(`[MiningEngine] ⚠️ No related keywords found for "${seedKeyword}"`);
        return { processed: 0, saved: 0, items: [] };
    }

    console.log(`[MiningEngine] 📥 Fetched ${relatedList.length} related keywords from API`);

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
    const beforeFilterCount = candidates.length;
    const filteredByVolume = candidates.filter((c: any) => c.total_search_cnt >= minSearchVolume);
    const filteredByBlacklist = filteredByVolume.filter((c: any) => !isBlacklisted(c.originalKeyword));
    let filtered = filteredByBlacklist;
    filtered.sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt);
    
    console.log(`[MiningEngine] 🔍 Filtering results:`, {
        totalCandidates: beforeFilterCount,
        afterVolumeFilter: filteredByVolume.length,
        afterBlacklistFilter: filtered.length,
        minSearchVolume,
        volumeFilteredOut: beforeFilterCount - filteredByVolume.length,
        blacklistFilteredOut: filteredByVolume.length - filtered.length
    });

    // 🚀 터보모드 최적화: Smart Deduplication 비활성화 (DB 읽기 최소화)
    // INSERT OR REPLACE가 이미 중복을 처리하므로 별도 SELECT 불필요
    // DB 부하를 최소화하고 수집 속도를 최대화

    // 3b. Apply Max Limit
    if (maxKeywords > 0 && filtered.length > maxKeywords) {
        console.log(`[MiningEngine] Slicing results from ${filtered.length} to ${maxKeywords}`);
        filtered = filtered.slice(0, maxKeywords);
    }

    // 로그는 위에서 이미 출력됨

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

    // 6. Bulk Upsert (Processed) - UPSERT 최적화로 DB 호출 획기적 감소
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
    // These will have null doc counts and 'UNRANKED' - 메모리에서 즉시 계산하여 DB 부하 더 감소
    const rowsDeferred = candidatesToSaveOnly.map((r: any) => {
        // 🚀 프리컴퓨테이션: 메모리에서 즉시 계산하여 DB 저장 부하 감소
        const total = Math.round(r.pc_search_cnt + r.mo_search_cnt);
        let ratio = 0;
        let tier = 'UNRANKED';

        if (total > 0) {
            // 문서수가 없으므로 경쟁이 낮다고 가정하고 기본 등급 부여
            tier = total > 10000 ? '2등급' : '3등급'; // 고검색량 키워드 우선 등급화
            ratio = 1.0; // 기본 비율
        }

        return {
            keyword: r.originalKeyword,
            total_search_cnt: total,
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
            golden_ratio: ratio,
            tier: tier,
            is_expanded: false
        };
    });

    // 🚀 터보모드: 단일 트랜잭션으로 통합하여 DB 호출 최소화 (BEGIN/COMMIT 1회만)
    let totalSaved = 0;
    const allRows = [...rowsToInsert, ...rowsDeferred];

    console.log(`[MiningEngine] 📊 Data preparation summary:`, {
        rowsToInsert: rowsToInsert.length,
        rowsDeferred: rowsDeferred.length,
        totalRows: allRows.length,
        seedKeyword: seedKeyword
    });

    if (allRows.length > 0) {
        const now = getCurrentTimestamp();

        console.log(`[MiningEngine] 🔄 Starting batch insert for ${allRows.length} rows`);
        
        try {
            // 🚀 실제로 새로 삽입된 키워드 수를 확인하기 위해 삽입 전 존재 여부 확인
            // 배치 단위로 존재하는 키워드를 확인하여 DB 읽기 최소화
            const batchSize = 1000;
            const totalBatches = Math.ceil(allRows.length / batchSize);
            let actualSaved = 0;
            
            console.log(`[MiningEngine] 📦 Preparing ${totalBatches} batch(es) with batchSize=${batchSize}...`);
            
            for (let i = 0; i < allRows.length; i += batchSize) {
                const batchIndex = Math.floor(i / batchSize) + 1;
                const batch = allRows.slice(i, i + batchSize);
                console.log(`[MiningEngine] 📦 Processing batch ${batchIndex}/${totalBatches} with ${batch.length} rows...`);
                
                // 배치 내 키워드 목록 추출
                const keywords = batch.map(row => row.keyword);
                
                // 존재하는 키워드 확인 (배치 단위로 한 번만 쿼리)
                const existingKeywordsResult = await db.execute({
                    sql: `SELECT keyword FROM keywords WHERE keyword IN (${keywords.map(() => '?').join(',')})`,
                    args: keywords
                });
                const existingKeywords = new Set(
                    existingKeywordsResult.rows.map(row => row.keyword as string)
                );
                
                // 새로 삽입할 키워드만 필터링
                const newRows = batch.filter(row => !existingKeywords.has(row.keyword));
                const skippedCount = batch.length - newRows.length;
                
                if (skippedCount > 0) {
                    console.log(`[MiningEngine] ⏭️ Skipping ${skippedCount} existing keywords in batch ${batchIndex}`);
                }
                
                if (newRows.length > 0) {
                    try {
                        const statements = newRows.map(row => {
                            const isDeferred = row.total_doc_cnt === null;
                            return {
                                sql: `INSERT OR IGNORE INTO keywords (
                                    id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                                    pc_click_cnt, mo_click_cnt, click_cnt,
                                    pc_ctr, mo_ctr, total_ctr,
                                    comp_idx, pl_avg_depth,
                                    total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                                    web_doc_cnt, news_doc_cnt,
                                    golden_ratio, tier, is_expanded,
                                    created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                args: isDeferred
                                    ? [
                                        generateUUID(), row.keyword, row.total_search_cnt, row.pc_search_cnt, row.mo_search_cnt,
                                        row.pc_click_cnt || 0, row.mo_click_cnt || 0, row.click_cnt || 0,
                                        row.pc_ctr || 0, row.mo_ctr || 0, row.total_ctr || 0,
                                        row.comp_idx || null, row.pl_avg_depth || 0,
                                        null, 0, 0, 0, 0,
                                        0, row.tier, row.is_expanded ? 1 : 0,
                                        now, now
                                    ]
                                    : [
                                        generateUUID(), row.keyword, row.total_search_cnt, row.pc_search_cnt, row.mo_search_cnt,
                                        row.pc_click_cnt || 0, row.mo_click_cnt || 0, row.click_cnt || 0,
                                        row.pc_ctr || 0, row.mo_ctr || 0, row.total_ctr || 0,
                                        row.comp_idx || null, row.pl_avg_depth || 0,
                                        row.total_doc_cnt, (row as any).blog_doc_cnt || 0, (row as any).cafe_doc_cnt || 0,
                                        (row as any).web_doc_cnt || 0, (row as any).news_doc_cnt || 0,
                                        row.golden_ratio, row.tier, row.is_expanded ? 1 : 0,
                                        now, now
                                    ]
                            };
                        });
                        
                        console.log(`[MiningEngine] 📦 Executing db.batch() with ${statements.length} new keywords...`);
                        
                        // 삽입 전 키워드 개수 확인
                        const beforeCountResult = await db.execute({
                            sql: `SELECT COUNT(*) as count FROM keywords WHERE keyword IN (${newRows.map(() => '?').join(',')})`,
                            args: newRows.map(r => r.keyword)
                        });
                        const beforeCount = (beforeCountResult.rows[0]?.count as number) || 0;
                        
                        // 실제 삽입 실행
                        await db.batch(statements);
                        
                        // 삽입 후 키워드 개수 확인 (실제 저장 여부 검증)
                        const afterCountResult = await db.execute({
                            sql: `SELECT COUNT(*) as count FROM keywords WHERE keyword IN (${newRows.map(() => '?').join(',')})`,
                            args: newRows.map(r => r.keyword)
                        });
                        const afterCount = (afterCountResult.rows[0]?.count as number) || 0;
                        const actuallyInserted = afterCount - beforeCount;
                        
                        actualSaved += actuallyInserted;
                        console.log(`[MiningEngine] ✅ Batch ${batchIndex}/${totalBatches} succeeded:`, {
                            attempted: newRows.length,
                            beforeCount,
                            afterCount,
                            actuallyInserted,
                            totalSaved: actualSaved
                        });
                        
                        if (actuallyInserted < newRows.length) {
                            console.warn(`[MiningEngine] ⚠️ Warning: Only ${actuallyInserted} out of ${newRows.length} keywords were actually saved!`);
                        }
                    } catch (batchError: any) {
                        console.error(`[MiningEngine] ❌ Batch ${batchIndex} insert error:`, {
                            message: batchError.message,
                            stack: batchError.stack,
                            code: batchError.code,
                            keywordsCount: newRows.length,
                            sampleKeywords: newRows.slice(0, 3).map(r => r.keyword)
                        });
                        // 에러가 발생해도 다음 배치 계속 처리
                        throw batchError;
                    }
                } else {
                    console.log(`[MiningEngine] ⏭️ Batch ${batchIndex}/${totalBatches} skipped (all keywords already exist)`);
                }
            }
            
            totalSaved = actualSaved;
            console.log(`[MiningEngine] ✅ All batches completed successfully. totalSaved=${totalSaved} (${allRows.length - actualSaved} duplicates skipped)`);
        } catch (e: any) {
            console.error(`[MiningEngine] ❌ DB Batch Error:`, {
                message: e.message,
                stack: e.stack,
                name: e.name,
                code: e.code,
                rowsCount: allRows.length
            });
            throw new Error(`DB Save Failed: ${e.message}`);
        }
    } else {
        console.log(`[MiningEngine] ℹ️ No rows to save (allRows.length=0)`);
    }

    return {
        processed: rowsToInsert.length,
        saved: totalSaved,
        items: [...rowsToInsert, ...rowsDeferred] // Return ALL items for UI
    };
}
