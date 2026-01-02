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
            // Golden Ratio: 검색량 / (블로그 + 카페 + 웹 문서수)
            // 뉴스는 제외 (SEO 경쟁 지표로 부적합)
            const viewDocCnt = (r.blog || 0) + (r.cafe || 0) + (r.web || 0);

            let ratio = 0;
            let tier = 'UNRANKED';

            if (viewDocCnt > 0) {
                ratio = r.total_search_cnt / viewDocCnt;

                // 등급 산정: PLATINUM, GOLD, SILVER, BRONZE
                if (viewDocCnt <= 100 && ratio > 5) {
                    tier = 'PLATINUM';  // 초고효율: 문서 100개 이하 + 비율 5 이상
                } else if (ratio > 10) {
                    tier = 'PLATINUM';  // 매우 높은 비율
                } else if (ratio > 5) {
                    tier = 'GOLD';      // 높은 비율
                } else if (ratio > 1) {
                    tier = 'SILVER';    // 보통 비율
                } else {
                    tier = 'BRONZE';    // 낮은 비율
                }
            } else if (r.total_search_cnt > 0 && r.total != null) {
                // No view competition? PLATINUM!
                tier = 'PLATINUM';
                ratio = 99.99;
            }

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

import { keywordCache } from './keyword-cache';

// 🚀💰 Turso 비용 최적화: Zero-Read Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기존: SELECT로 중복 체크 → Row Reads 폭증
// 신규: In-Memory Cache로 체크 → Row Reads: 0
// 신규: ON CONFLICT DO UPDATE → 쓰기 쿼터 활용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function bulkDeferredInsert(keywords: Keyword[]): Promise<{ inserted: number; updated: number }> {
    if (!keywords.length) return { inserted: 0, updated: 0 };

    const db = getTursoClient();
    await keywordCache.init(); // Ensure cache is ready

    // 1️⃣ 로컬 중복 제거 (동일 배치 내)
    const uniqueKeywords = Array.from(new Map(keywords.map(k => [k.keyword, k])).values());

    // 2️⃣ 메모리 캐시로 신규/기존 분류 (DB 접근 없음!)
    const newKeywords: Keyword[] = [];
    const existingKeywords: Keyword[] = [];

    uniqueKeywords.forEach(k => {
        if (keywordCache.has(k.keyword)) {
            existingKeywords.push(k);
        } else {
            newKeywords.push(k);
        }
    });

    console.log(`[MiningEngine] 💰 Zero-Read Filter: ${uniqueKeywords.length} items -> New: ${newKeywords.length}, Existing: ${existingKeywords.length}`);

    if (uniqueKeywords.length === 0) {
        return { inserted: 0, updated: 0 };
    }

    // 3️⃣ Bulk Upsert: ON CONFLICT DO UPDATE 패턴
    // - 신규: INSERT
    // - 기존: UPDATE (문서수, 업데이트 시간 갱신)
    const BATCH_SIZE = 500; // Turso 안정성을 위한 청크
    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < uniqueKeywords.length; i += BATCH_SIZE) {
        const batch = uniqueKeywords.slice(i, i + BATCH_SIZE);

        // ON CONFLICT 구문을 위한 prepared statements
        const statements = batch.map(kw => ({
            sql: `INSERT INTO keywords (
                keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                pc_click_cnt, mo_click_cnt, click_cnt, pc_ctr, mo_ctr, total_ctr,
                comp_idx, pl_avg_depth, total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
                web_doc_cnt, news_doc_cnt, golden_ratio, tier, is_expanded,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            WHERE excluded.total_search_cnt > 0;`,
            args: [
                kw.keyword, kw.total_search_cnt, kw.pc_search_cnt || 0, kw.mo_search_cnt || 0,
                kw.pc_click_cnt || 0, kw.mo_click_cnt || 0, kw.click_cnt || 0,
                kw.pc_ctr || 0, kw.mo_ctr || 0, kw.total_ctr || 0,
                kw.comp_idx || 0, kw.pl_avg_depth || 0,
                kw.total_doc_cnt || null, kw.blog_doc_cnt || 0, kw.cafe_doc_cnt || 0,
                kw.web_doc_cnt || 0, kw.news_doc_cnt || 0,
                kw.golden_ratio || 0, kw.tier || 'UNRANKED', kw.is_expanded ? 1 : 0,
                getCurrentTimestamp(), getCurrentTimestamp()
            ]
        }));

        try {
            await db.batch(statements);

            // 4️⃣ 캐시 업데이트: 신규 키워드만 추가
            const newInBatch = batch.filter(k => !keywordCache.has(k.keyword));
            keywordCache.addBatch(newInBatch.map(k => k.keyword));

            totalInserted += newInBatch.length;
            totalUpdated += (batch.length - newInBatch.length);

            console.log(`[MiningEngine] ⚡ Batch ${Math.floor(i / BATCH_SIZE) + 1}: +${newInBatch.length} new, ~${batch.length - newInBatch.length} updated`);
        } catch (e: any) {
            console.error(`[MiningEngine] Batch upsert failed at offset ${i}:`, e.message);
        }
    }

    console.log(`[MiningEngine] 🎯 Zero-Read Upsert Complete: ${totalInserted} inserted, ${totalUpdated} updated (Row Reads: 0)`);
    return { inserted: totalInserted, updated: totalUpdated };
}
