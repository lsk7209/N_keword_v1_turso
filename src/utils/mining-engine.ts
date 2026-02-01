/**
 * ⚡ 획기적 DB 최적화: 지연 쓰기 (Deferred Writes) 전략
 *
 * 기존: 시드당 즉시 DB Write (INSERT + UPDATE)
 * 신규: 메모리에 축적 후 배치 Write (INSERT만)
 *
 * Write 감소 효과: 시드당 2-3회 → 1회 (33-50% 절약)
 */

import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount, DocCounts } from '@/utils/naver-api';
import { isBlacklisted } from '@/utils/blacklist';
import { BloomFilter } from './bloom-filter';
import { BloomManager } from './bloom-manager';

export interface Keyword {
    id?: string;
    keyword: string;
    originalKeyword?: string;
    total_search_cnt: number;
    pc_search_cnt?: number;
    mo_search_cnt?: number;
    pc_click_cnt?: number;
    mo_click_cnt?: number;
    click_cnt?: number;
    pc_ctr?: number;
    mo_ctr?: number;
    total_ctr?: number;
    comp_idx?: string;
    pl_avg_depth?: number;
    total_doc_cnt?: number | null;
    blog_doc_cnt?: number;
    cafe_doc_cnt?: number;
    web_doc_cnt?: number;
    news_doc_cnt?: number;
    golden_ratio?: number;
    tier?: string;
    is_expanded?: boolean | number;
    created_at?: string;
    updated_at?: string;
}

export interface MiningResult {
    processed: number; // Count of fully processed items (with doc count)
    saved: number; // Total items saved to DB
    items: Keyword[]; // The fully processed items to return to UI
}

/**
 * 🎯 황금키워드 티어 및 비율 계산 로직 (공용)
 */
export function calculateTierAndRatio(searchCnt: number, counts: Partial<DocCounts>): { tier: string; ratio: number } {
    const viewDocCnt = (counts.blog || 0) + (counts.cafe || 0) + (counts.web || 0);
    let ratio = 0;
    let tier = 'UNRANKED';

    if (viewDocCnt > 0) {
        ratio = searchCnt / viewDocCnt;

        if (viewDocCnt <= 100 && ratio > 5) {
            tier = 'PLATINUM';
        } else if (ratio > 10) {
            tier = 'PLATINUM';
        } else if (ratio > 5) {
            tier = 'GOLD';
        } else if (ratio > 1) {
            tier = 'SILVER';
        } else {
            tier = 'BRONZE';
        }
    } else if (searchCnt > 0 && counts.total != null) {
        tier = 'PLATINUM';
        ratio = 99.99;
    }

    return { tier, ratio };
}

export async function processSeedKeyword(
    seedKeyword: string,
    limitDocCount = 0,
    skipDocFetch = false,
    minSearchVolume = 100,
    maxKeywords = 0
): Promise<MiningResult> {
    // 🚀 획기적 최적화: 메모리 기반 결과 축적
    let memoryResults: Keyword[] = [];
    let memoryDeferredResults: Keyword[] = [];

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
    const filtered = filteredByBlacklist;
    filtered.sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt);

    console.log(`[MiningEngine] 🔍 Filtering results:`, {
        totalCandidates: beforeFilterCount,
        afterVolumeFilter: filteredByVolume.length,
        afterBlacklistFilter: filtered.length,
        minSearchVolume,
        volumeFilteredOut: beforeFilterCount - filteredByVolume.length,
        blacklistFilteredOut: filteredByVolume.length - filtered.length
    });

    // 3b. Apply Max Limit
    let finalFiltered = filtered;
    if (maxKeywords > 0 && finalFiltered.length > maxKeywords) {
        console.log(`[MiningEngine] Slicing results from ${finalFiltered.length} to ${maxKeywords}`);
        finalFiltered = finalFiltered.slice(0, maxKeywords);
    }

    let candidatesToProcess: Keyword[] = [];
    let candidatesToSaveOnly: Keyword[] = [];

    if (skipDocFetch) {
        candidatesToSaveOnly = finalFiltered;
    } else {
        candidatesToProcess = limitDocCount > 0 ? finalFiltered.slice(0, limitDocCount) : finalFiltered;
        candidatesToSaveOnly = limitDocCount > 0 ? finalFiltered.slice(limitDocCount) : [];
    }

    // 🚀 획기적 변경: DB Write 제거, 메모리만 사용
    if (skipDocFetch) {
        // 메모리에만 저장, DB Write 없음
        memoryDeferredResults = candidatesToSaveOnly.map((r: any) => ({
            ...r,
            total_doc_cnt: null,
            blog_doc_cnt: 0,
            cafe_doc_cnt: 0,
            web_doc_cnt: 0,
            news_doc_cnt: 0,
            golden_ratio: 0,
            tier: 'UNRANKED',
            is_expanded: false
        }));
    } else {
        // 문서 수집 대상만 메모리에 저장
        candidatesToProcess.forEach((cand: any) => {
            memoryResults.push({
                keyword: cand.originalKeyword,
                total_search_cnt: cand.total_search_cnt,
                pc_search_cnt: cand.pc_search_cnt,
                mo_search_cnt: cand.mo_search_cnt,
                pc_click_cnt: cand.pc_click_cnt,
                mo_click_cnt: cand.mo_click_cnt,
                click_cnt: cand.click_cnt,
                pc_ctr: cand.pc_ctr,
                mo_ctr: cand.mo_ctr,
                total_ctr: cand.total_ctr,
                comp_idx: cand.comp_idx,
                pl_avg_depth: cand.pl_avg_depth,
                is_expanded: false
            });
        });

        candidatesToSaveOnly.forEach((cand: any) => {
            memoryDeferredResults.push({
                keyword: cand.originalKeyword,
                total_search_cnt: cand.total_search_cnt,
                pc_search_cnt: cand.pc_search_cnt,
                mo_search_cnt: cand.mo_search_cnt,
                pc_click_cnt: cand.pc_click_cnt,
                mo_click_cnt: cand.mo_click_cnt,
                click_cnt: cand.click_cnt,
                pc_ctr: cand.pc_ctr,
                mo_ctr: cand.mo_ctr,
                total_ctr: cand.total_ctr,
                comp_idx: cand.comp_idx,
                pl_avg_depth: cand.pl_avg_depth,
                total_doc_cnt: null,
                blog_doc_cnt: 0,
                cafe_doc_cnt: 0,
                web_doc_cnt: 0,
                news_doc_cnt: 0,
                golden_ratio: 0,
                tier: 'UNRANKED',
                is_expanded: false
            });
        });
    }

    // 5. Fetch Document Counts (Parallel Batches) for candidatesToProcess
    if (!skipDocFetch && candidatesToProcess.length > 0) {
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

        // 6. Process Results for Memory
        processedResults.forEach((r: Keyword & Partial<DocCounts>) => {
            const { tier, ratio } = calculateTierAndRatio(r.total_search_cnt, r);

            memoryResults.push({
                keyword: r.originalKeyword || r.keyword,
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
            });
        });
    }

    // 🚀 획기적 최적화: DB 호출 완전 제거
    // 결과만 메모리에 반환, 실제 DB Write는 호출자(batch-runner)가 배치로 처리
    const totalProcessed = memoryResults.length + memoryDeferredResults.length;

    console.log(`[MiningEngine] 📦 Deferred Write: ${totalProcessed} keywords stored in memory (DB Write: 0)`);

    return {
        processed: memoryResults.length,
        saved: totalProcessed,
        items: [...memoryResults, ...memoryDeferredResults]
    };
}

// 🚀 HYBRID OPTIMIZATION: Smart Write Policy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy:
// 1. High Volume (>=1000): DIRECT UPSERT (No explicit read check) -> Saves 1 Read, Costs 1 Write
//    Reason: These are valuable, we always want to update them or insert them.
//    "Why check if we are going to write anyway?"
//
// 2. Low Volume (<1000): READ CHECK -> Filter -> INSERT ONLY NEW
//    Reason: These are long-tail. Most already exist. We want to avoid writing if they exist.
//    Cost: 1 Read (to check).
//          If Exists -> SKIP (Save 1 Write!)
//          If New -> INSERT (Cost 1 Write)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function bulkDeferredInsert(keywords: Keyword[]): Promise<{ inserted: number; updated: number; skipped: number }> {
    if (!keywords.length) return { inserted: 0, updated: 0, skipped: 0 };

    const db = getTursoClient();

    // 1️⃣ Dedup in memory first
    const uniqueKeywords = Array.from(new Map(keywords.map(k => [k.keyword, k])).values());

    if (uniqueKeywords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0 };
    }

    // 🌸 2️⃣ Load Bloom Filter (Zero-Read Optimization)
    let bloom: BloomFilter | null = null;
    try {
        bloom = await BloomManager.getFilter();
    } catch (e) {
        console.warn('[MiningEngine] Bloom filter load failed, falling back to hybrid:', e);
    }

    const BATCH_SIZE = 100; // 최적의 원자성을 보장하는 배치 크기 (Turso 최적화)
    let totalUpserted = 0;
    let totalSkipped = 0;
    let bloomSavedCount = 0;

    // Process in batches
    for (let i = 0; i < uniqueKeywords.length; i += BATCH_SIZE) {
        const batch = uniqueKeywords.slice(i, i + BATCH_SIZE);
        const toUpsert: Keyword[] = [];

        // Split Batch: High vs Low Volume
        const highVolumeBatch = batch.filter(k => k.total_search_cnt >= 1000);
        const lowVolumeBatch = batch.filter(k => k.total_search_cnt < 1000);

        // A. High Volume: Always Upsert (Valuable)
        toUpsert.push(...highVolumeBatch);

        // B. Low Volume: Check Existence (Zero-Read via Bloom -> Hybrid DB)
        if (lowVolumeBatch.length > 0) {
            const potentialNew: Keyword[] = [];
            const maybeTypes: Keyword[] = [];

            for (const kw of lowVolumeBatch) {
                // 🌸 Bloom Check
                if (bloom && !bloom.has(kw.keyword)) {
                    // Definitely New! (Zero-Read Success)
                    potentialNew.push(kw);
                    bloom.add(kw.keyword); // Add to bloom cache
                    bloomSavedCount++;
                } else {
                    // Maybe Exists (or Bloom failed) -> Check DB
                    maybeTypes.push(kw);
                }
            }

            // 1. New from Bloom are added directly
            toUpsert.push(...potentialNew);

            // 2. Check "Maybe" keywords via DB (Legacy Hybrid Check)
            if (maybeTypes.length > 0) {
                const maybeKeywords = maybeTypes.map(k => k.keyword);

                try {
                    const placeholders = maybeKeywords.map(() => '?').join(',');
                    const res = await db.execute({
                        sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
                        args: maybeKeywords
                    });

                    const existingSet = new Set(res.rows.map(r => String(r.keyword)));

                    for (const kw of maybeTypes) {
                        if (!existingSet.has(kw.keyword)) {
                            toUpsert.push(kw); // Really New -> Insert
                            if (bloom) {
                                bloom.add(kw.keyword); // Update bloom (False positive correction?) No, just ensure it's there
                                bloomSavedCount++;
                            }
                        } else {
                            totalSkipped++; // Existing -> Skip
                        }
                    }
                } catch (e) {
                    console.error(`[MiningEngine] ⚠️ Failed check for low-vol batch, fallback to Upsert All:`, e);
                    toUpsert.push(...maybeTypes);
                }
            }
        }

        if (toUpsert.length === 0) continue;

        const validUpserts: any[] = [];

        for (const kw of toUpsert) {
            // 🔍 Smart Throttling Logic
            // Calculate difference for search count and doc count
            const oldTotalSearch = kw.total_search_cnt || 0;
            const newTotalSearch = kw.total_search_cnt; // Inbound value
            const searchDiff = Math.abs(newTotalSearch - oldTotalSearch);
            const searchChangeRatio = oldTotalSearch > 0 ? searchDiff / oldTotalSearch : 1;

            // Check doc change only if new doc count is provided
            // Assuming we don't know the OLD doc count here without reading, BUT the WHERE clause in SQL handles it.
            // However, we want to prevent sending the SQL entirely if it's likely useless.
            // Since we don't have the OLD record to compare in memory (except high-volume ones if we cached them), 
            // we will rely on the SQL WHERE clause to filter out updates at the DB level, BUT 'ON CONFLICT' still counts as a write attempt?
            // SQLite 'ON CONFLICT DO UPDATE' where the WHERE clause filters out rows MIGHT still count towards row limits if not careful.
            // Actually, Turso counts "Rows Written". If the UPDATE changes 0 rows, it might be 0 writes.
            // BUT, to be safe, let's keep the WHERE clause robust.

            // The issue is we already pushed to `toUpsert` above.
            // So we just map it to SQL statements with the STRICT WHERE CLAUSE.

            validUpserts.push({
                sql: `INSERT INTO keywords (
                    id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                    pc_click_cnt, mo_click_cnt, click_cnt, pc_ctr, mo_ctr, total_ctr,
                    comp_idx, pl_avg_depth, total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                    web_doc_cnt, news_doc_cnt, golden_ratio, tier, is_expanded,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(keyword) DO UPDATE SET
                    total_search_cnt = excluded.total_search_cnt,
                    pc_search_cnt = excluded.pc_search_cnt,
                    mo_search_cnt = excluded.mo_search_cnt,
                    pc_click_cnt = excluded.pc_click_cnt,
                    mo_click_cnt = excluded.mo_click_cnt,
                    click_cnt = excluded.click_cnt,
                    pc_ctr = excluded.pc_ctr,
                    mo_ctr = excluded.mo_ctr,
                    total_ctr = excluded.total_ctr,
                    comp_idx = excluded.comp_idx,
                    pl_avg_depth = excluded.pl_avg_depth,
                    total_doc_cnt = COALESCE(excluded.total_doc_cnt, total_doc_cnt),
                    blog_doc_cnt = COALESCE(excluded.blog_doc_cnt, blog_doc_cnt),
                    cafe_doc_cnt = COALESCE(excluded.cafe_doc_cnt, cafe_doc_cnt),
                    web_doc_cnt = COALESCE(excluded.web_doc_cnt, web_doc_cnt),
                    news_doc_cnt = COALESCE(excluded.news_doc_cnt, news_doc_cnt),
                    golden_ratio = COALESCE(excluded.golden_ratio, golden_ratio),
                    tier = COALESCE(excluded.tier, tier),
                    updated_at = excluded.updated_at
                WHERE (ABS(keywords.total_search_cnt - excluded.total_search_cnt) > 10) 
                   OR (keywords.total_doc_cnt IS NULL AND excluded.total_doc_cnt IS NOT NULL)
                   OR (keywords.tier = 'UNRANKED' AND excluded.tier != 'UNRANKED');`,
                args: [
                    kw.id || generateUUID(),
                    kw.keyword, kw.total_search_cnt, kw.pc_search_cnt || 0, kw.mo_search_cnt || 0,
                    kw.pc_click_cnt || 0, kw.mo_click_cnt || 0, kw.click_cnt || 0,
                    kw.pc_ctr || 0, kw.mo_ctr || 0, kw.total_ctr || 0,
                    kw.comp_idx || 0, kw.pl_avg_depth || 0,
                    kw.total_doc_cnt || null, kw.blog_doc_cnt || 0, kw.cafe_doc_cnt || 0,
                    kw.web_doc_cnt || 0, kw.news_doc_cnt || 0,
                    kw.golden_ratio || 0, kw.tier || 'UNRANKED', kw.is_expanded ? 1 : 0,
                    getCurrentTimestamp(), getCurrentTimestamp()
                ]
            });
        }

        if (validUpserts.length === 0) continue;

        try {
            await db.batch(validUpserts);
            totalUpserted += validUpserts.length;
            console.log(`[MiningEngine] ⚡ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${validUpserts.length} sent to DB (Throttled Mode)`);
        } catch (e: any) {
            console.error(`[MiningEngine] Batch upsert failed at offset ${i}:`, e.message);
        }
    }

    // 🌸 Async Save Bloom Filter if changed
    if (bloom && bloomSavedCount > 0) {
        BloomManager.saveFilter(bloom).catch(err => console.error('[MiningEngine] Failed to save bloom filter:', err));
    }

    console.log(`[MiningEngine] 🎯 Hybrid+Bloom Optimization: Upserted: ${totalUpserted}, Skipped: ${totalSkipped}`);
    return { inserted: totalUpserted, updated: 0, skipped: totalSkipped };
}
