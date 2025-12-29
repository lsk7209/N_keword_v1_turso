/**
 * ⚡ 획기적 DB 최적화: 지연 쓰기 (Deferred Writes) 전략
 *
 * 기존: 시드당 즉시 DB Write (INSERT + UPDATE)
 * 신규: 메모리에 축적 후 배치 Write (INSERT만)
 *
 * Write 감소 효과: 시드당 2-3회 → 1회 (33-50% 절약)
 */

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
    minSearchVolume = 100,
    maxKeywords = 0
): Promise<MiningResult> {
    // 🚀 획기적 최적화: 메모리 기반 결과 축적
    // DB Write를 완전히 제거하고 메모리에만 저장
    let memoryResults: any[] = [];
    let memoryDeferredResults: any[] = [];

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

    let candidatesToProcess: any[] = [];
    let candidatesToSaveOnly: any[] = [];

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
        processedResults.forEach((r: any) => {
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

            memoryResults.push({
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

// 🚀 획기적 최적화: 벌크 메모리 기반 배치 처리 함수 추가
export async function bulkDeferredInsert(keywords: any[]): Promise<{ inserted: number }> {
    if (!keywords.length) return { inserted: 0 };

    const db = getTursoClient();

    // 🚀 단일 배치 INSERT로 모든 키워드 처리 (Write: 1회)
    const statements = keywords.map(kw => ({
        sql: `INSERT OR IGNORE INTO keywords (
            keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
            pc_click_cnt, mo_click_cnt, click_cnt, pc_ctr, mo_ctr, total_ctr,
            comp_idx, pl_avg_depth, total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
            web_doc_cnt, news_doc_cnt, golden_ratio, tier, is_expanded,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        console.log(`[MiningEngine] ⚡ Bulk Deferred Insert: ${keywords.length} keywords in 1 batch (Write: 1)`);
        return { inserted: keywords.length };
    } catch (e) {
        console.error('[MiningEngine] Bulk insert failed:', e);
        throw e;
    }
}