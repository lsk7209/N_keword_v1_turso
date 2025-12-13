
import { getServiceSupabase } from '@/utils/supabase';
import { fetchRelatedKeywords, fetchDocumentCount } from '@/utils/naver-api';
import { isBlacklisted } from '@/utils/blacklist';

export interface MiningResult {
    processed: number; // Count of fully processed items (with doc count)
    saved: number; // Total items saved to DB
    items: any[]; // The fully processed items to return to UI
}

export async function processSeedKeyword(seedKeyword: string, limitDocCount = 0, skipDocFetch = false): Promise<MiningResult> {
    const adminDb = getServiceSupabase();
    console.log(`[MiningEngine] Processing seed: ${seedKeyword} (SkipDoc: ${skipDocFetch})`);

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
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.includes('<')) return 5;
            return parseInt(String(val).replace(/,/g, '')) || 0;
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

    // 3. Filter (Volume >= 1000 & Blacklist)
    const filtered = candidates.filter((c: any) => c.total_search_cnt >= 1000 && !isBlacklisted(c.originalKeyword));
    filtered.sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt);

    let candidatesToProcess: any[] = [];
    let candidatesToSaveOnly: any[] = [];

    if (skipDocFetch) {
        candidatesToSaveOnly = filtered;
    } else {
        candidatesToProcess = limitDocCount > 0 ? filtered.slice(0, limitDocCount) : filtered;
        candidatesToSaveOnly = limitDocCount > 0 ? filtered.slice(limitDocCount) : [];
    }

    // 5. Fetch Document Counts (Parallel Batches) for candidatesToProcess
    const processedResults = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < candidatesToProcess.length; i += BATCH_SIZE) {
        const chunk = candidatesToProcess.slice(i, i + BATCH_SIZE);
        const promises = chunk.map(async (cand: any) => {
            try {
                const counts = await fetchDocumentCount(cand.originalKeyword);
                return { ...cand, ...counts };
            } catch (e) {
                console.error(`Failed doc count for ${cand.originalKeyword}:`, e);
                return { ...cand, total: null }; // Mark as failed doc count
            }
        });

        const chunkResults = await Promise.all(promises);
        processedResults.push(...chunkResults);
    }

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

    // A. Rows with Document Counts (Complete Data) -> Standard Upsert (Update allowed)
    if (rowsToInsert.length > 0) {
        const { error: insertError } = await (adminDb as any)
            .from('keywords')
            .upsert(rowsToInsert as any, { onConflict: 'keyword' })
            .select('id');

        if (insertError) {
            console.error('DB Upsert Error (Complete):', insertError);
            throw new Error(`DB Save Failed (Complete): ${insertError.message}`);
        }
        totalSaved += rowsToInsert.length;
    }

    // B. Rows Deferred (Null Docs) -> Insert Only (ignoreDuplicates)
    if (rowsDeferred.length > 0) {
        const { error: deferredError } = await (adminDb as any)
            .from('keywords')
            .upsert(rowsDeferred as any, { onConflict: 'keyword', ignoreDuplicates: true })
            .select('id');

        if (deferredError) {
            console.error('DB Upsert Error (Deferred):', deferredError);
            throw new Error(`DB Save Failed (Deferred): ${deferredError.message}`);
        }
        totalSaved += rowsDeferred.length;
    }

    return {
        processed: rowsToInsert.length,
        saved: totalSaved,
        items: skipDocFetch ? rowsDeferred : rowsToInsert // Return user-facing processed items
    };
}
