
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

        const pcCnt = parseCnt(item.monthlyPcQcCnt);
        const moCnt = parseCnt(item.monthlyMobileQcCnt);
        const total = pcCnt + moCnt;

        return {
            keyword: item.relKeyword.replace(/\s+/g, ''),
            originalKeyword: item.relKeyword,
            pc_search_cnt: pcCnt,
            mo_search_cnt: moCnt,
            total_search_cnt: total,
            click_cnt: parseCnt(item.monthlyAvePcClkCnt) + parseCnt(item.monthlyAveMobileClkCnt),
            comp_idx: item.compIdx,
            pl_avg_depth: parseCnt(item.plAvgDepth)
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
        // Golden Ratio Logic Update:
        // Use (Blog + Cafe) count as the denominator (Competition).
        const viewDocCnt = (r.blog || 0) + (r.cafe || 0);

        let ratio = 0;
        let tier = 'UNRANKED';

        if (viewDocCnt > 0) {
            ratio = r.total_search_cnt / viewDocCnt;

            if (ratio > 10) tier = 'PLATINUM';
            else if (ratio > 5) tier = 'GOLD';
            else if (ratio > 1) tier = 'SILVER';
            else tier = 'BRONZE';
        } else if (r.total_search_cnt > 0 && r.total != null) {
            // No view competition? Platinum.
            tier = 'PLATINUM';
            ratio = 99.99;
        }

        return {
            keyword: r.originalKeyword,
            total_search_cnt: r.total_search_cnt,
            pc_search_cnt: r.pc_search_cnt,
            mo_search_cnt: r.mo_search_cnt,
            click_cnt: r.click_cnt,
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
        click_cnt: r.click_cnt,
        comp_idx: r.comp_idx,
        pl_avg_depth: r.pl_avg_depth,
        total_doc_cnt: null, // Defer
        golden_ratio: 0,
        tier: 'UNRANKED',
        is_expanded: false
    }));

    // 6. Bulk Upsert
    // Split into two groups:
    // A. Rows with Document Counts (Complete Data) -> Standard Upsert (Update allowed)
    // B. Rows Deferred (Null Docs) -> Insert Only (ignoreDuplicates) to prevent overwriting existing valid data with NULL

    if (rowsToInsert.length > 0) {
        const { error: insertError } = await adminDb
            .from('keywords')
            .upsert(rowsToInsert, { onConflict: 'keyword' });

        if (insertError) console.error('DB Upsert Error (Complete):', insertError);
    }

    if (rowsDeferred.length > 0) {
        // Use ignoreDuplicates to protect existing data
        const { error: deferredError } = await adminDb
            .from('keywords')
            .upsert(rowsDeferred, { onConflict: 'keyword', ignoreDuplicates: true });

        if (deferredError) console.error('DB Upsert Error (Deferred):', deferredError);
    }

    const totalSaved = rowsToInsert.length + rowsDeferred.length;

    return {
        processed: rowsToInsert.length,
        saved: totalSaved,
        items: skipDocFetch ? rowsDeferred : rowsToInsert // Return correct items
    };
}
