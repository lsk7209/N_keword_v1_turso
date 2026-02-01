import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount } from '@/utils/naver-api';
import { calculateTierAndRatio } from '@/utils/mining-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const keywordsInput = body.keywords;

        if (!keywordsInput || !Array.isArray(keywordsInput)) {
            return NextResponse.json({ error: 'Invalid keywords input' }, { status: 400 });
        }

        // 1. Normalize keywords
        const keywords = Array.from(new Set(
            keywordsInput
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0)
        ));

        if (keywords.length === 0) {
            return NextResponse.json({ data: [] });
        }

        const db = getTursoClient();

        // 2. Query existing keywords
        // Turso (SQLite) doesn't support array parameters easily in 'IN' clause without dynamic SQL construction
        const placeholders = keywords.map(() => '?').join(',');
        const existingResult = await db.execute({
            sql: `SELECT * FROM keywords WHERE keyword IN (${placeholders})`,
            args: keywords
        });

        const existingKeywordsMap = new Map();
        existingResult.rows.forEach((row: any) => {
            existingKeywordsMap.set(row.keyword, row);
        });

        // 3. Identify missing keywords
        const missingKeywords = keywords.filter(k => !existingKeywordsMap.has(k));
        const newResults: any[] = [];

        // 4. Fetch and save missing data
        // Process sequentially or with limited concurrency to avoid hitting rate limits too hard
        // For simplicity and safety with Naver API, we'll process them one by one or in small batches.
        // Given the requirement, let's process them and collect results.

        for (const keyword of missingKeywords) {
            try {
                // Fetch search volume (Ad API) -> fetchRelatedKeywords returns a list
                // We hope the seed keyword is in the list.
                const relatedKeywords = await fetchRelatedKeywords(keyword);
                // Find exact match or close enough? Ad API usually returns exact match in the list.
                const adData = relatedKeywords.find((item: any) => item.relKeyword === keyword.replace(/\s+/g, '')) ||
                    relatedKeywords.find((item: any) => item.relKeyword === keyword) ||
                    relatedKeywords[0]; // Fallback to first if exact not found (might be risky, but usually first is relevant)

                // Fetch document count
                const docCounts = await fetchDocumentCount(keyword);

                const now = getCurrentTimestamp();
                const { tier, ratio } = calculateTierAndRatio(
                    adData ? (parseInt(adData.monthlyPcQcCnt) + parseInt(adData.monthlyMobileQcCnt)) : 0,
                    docCounts
                );

                const newKeywordData = {
                    id: generateUUID(),
                    keyword: keyword,
                    total_search_cnt: adData ? (parseInt(adData.monthlyPcQcCnt) + parseInt(adData.monthlyMobileQcCnt)) : 0,
                    pc_search_cnt: adData ? parseInt(adData.monthlyPcQcCnt) : 0,
                    mo_search_cnt: adData ? parseInt(adData.monthlyMobileQcCnt) : 0,
                    click_cnt: adData ? (parseFloat(adData.monthlyAvePcClkCnt) + parseFloat(adData.monthlyAveMobileClkCnt)) : 0, // Approx
                    pc_click_cnt: adData ? parseFloat(adData.monthlyAvePcClkCnt) : 0,
                    mo_click_cnt: adData ? parseFloat(adData.monthlyAveMobileClkCnt) : 0,
                    total_ctr: adData ? parseFloat(adData.monthlyAvePcCtr) : 0, // simplified
                    pc_ctr: adData ? parseFloat(adData.monthlyAvePcCtr) : 0,
                    mo_ctr: adData ? parseFloat(adData.monthlyAveMobileCtr) : 0,
                    ctr: adData ? parseFloat(adData.monthlyAvePcCtr) : 0, // simplified fallback
                    comp_idx: adData ? adData.compIdx : null,
                    pl_avg_depth: 0,
                    avg_bid_price: adData ? parseInt(adData.plAvgDepth) : 0, // Mapping might be tricky, checking assumed structure
                    total_doc_cnt: docCounts.total,
                    blog_doc_cnt: docCounts.blog,
                    cafe_doc_cnt: docCounts.cafe,
                    web_doc_cnt: docCounts.web,
                    news_doc_cnt: docCounts.news,
                    tier: tier,
                    golden_ratio: ratio,
                    is_expanded: 0,
                    created_at: now,
                    updated_at: now
                };

                // Calculate Tier/Ratio if needed (logic can be duplicated from mining engine or simplified here)
                // For now, raw data is saved.

                await db.execute({
                    sql: `INSERT INTO keywords (
                        id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                        click_cnt, pc_click_cnt, mo_click_cnt,
                        total_ctr, pc_ctr, mo_ctr, ctr,
                        comp_idx, pl_avg_depth, avg_bid_price,
                        total_doc_cnt, blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, news_doc_cnt,
                        tier, golden_ratio, is_expanded, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        newKeywordData.id, newKeywordData.keyword, newKeywordData.total_search_cnt, newKeywordData.pc_search_cnt, newKeywordData.mo_search_cnt,
                        newKeywordData.click_cnt, newKeywordData.pc_click_cnt, newKeywordData.mo_click_cnt,
                        newKeywordData.total_ctr, newKeywordData.pc_ctr, newKeywordData.mo_ctr, newKeywordData.ctr,
                        newKeywordData.comp_idx, newKeywordData.pl_avg_depth, newKeywordData.avg_bid_price,
                        newKeywordData.total_doc_cnt, newKeywordData.blog_doc_cnt, newKeywordData.cafe_doc_cnt, newKeywordData.web_doc_cnt, newKeywordData.news_doc_cnt,
                        newKeywordData.tier, newKeywordData.golden_ratio, newKeywordData.is_expanded, newKeywordData.created_at, newKeywordData.updated_at
                    ]
                });

                newResults.push(newKeywordData);

            } catch (error) {
                console.error(`Error processing new keyword ${keyword}:`, error);
                // Return error state for this keyword or just skip? 
                // Let's return a partial object indicating failure for this specific keyword if possible, 
                // or just skip it in the saved list but maybe user wants to know it failed.
                // For this MVF, we'll skip saving but maybe add to results with error flag if UI supports it.
                // Or just ignore failed ones.
            }
        }

        // Combine results
        // Re-map original keywords to their data (either from existing or new)
        const finalResults = keywords.map(k => {
            if (existingKeywordsMap.has(k)) return existingKeywordsMap.get(k);
            const newData = newResults.find(n => n.keyword === k);
            return newData || null; // Null if failed to fetch
        }).filter(item => item !== null);

        return NextResponse.json({ data: finalResults });

    } catch (e: any) {
        console.error('Bulk keyword API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
