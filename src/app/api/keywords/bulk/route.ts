import { NextRequest, NextResponse } from 'next/server';
import { processSeedKeyword, bulkDeferredInsert, Keyword } from '@/utils/mining-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5분 타임아웃

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const keywordsInput = body.keywords;

        if (!keywordsInput || !Array.isArray(keywordsInput)) {
            return NextResponse.json({ error: 'Invalid keywords input' }, { status: 400 });
        }

        // 1. Normalize keywords
        const seeds = Array.from(new Set(
            keywordsInput
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0)
        ));

        if (seeds.length === 0) {
            return NextResponse.json({ data: [] });
        }

        // 2. Process each seed using Mining Engine
        // - MAX_KEYWORDS: 200 (연관검색어 최대 갯수 - 시간제한 때문에 축소)
        // - LIMIT_DOC_COUNT: 0 = ALL (모든 키워드의 문서수 수집)
        // - MIN_VOLUME: 100 (수집 기준 최소 검색량)
        const LIMIT_DOC_COUNT = 0;  // 0 = Fetch docs for ALL keywords
        const MAX_KEYWORDS = 200;   // Reduced for Vercel 5-min limit
        const MIN_VOLUME = 100;     // 수집 기준

        const allItems: Keyword[] = [];

        console.log(`[Bulk API] Processing ${seeds.length} seeds...`);

        for (let i = 0; i < seeds.length; i++) {
            const seed = seeds[i];
            try {
                console.log(`[Bulk API] Processing seed ${i + 1}/${seeds.length}: "${seed}"`);

                const result = await processSeedKeyword(
                    seed,
                    LIMIT_DOC_COUNT,
                    false,  // skipDocFetch = false (문서수 수집)
                    MIN_VOLUME,
                    MAX_KEYWORDS
                );

                if (result.items && result.items.length > 0) {
                    allItems.push(...result.items);
                    console.log(`[Bulk API] Seed "${seed}" returned ${result.items.length} keywords`);
                }
            } catch (error) {
                console.error(`[Bulk API] Failed for seed: ${seed}`, error);
            }
        }

        if (allItems.length === 0) {
            return NextResponse.json({ data: [], meta: { totalCollected: 0, displayed: 0, savedOnly: 0 } });
        }

        // 3. Deduplicate (prefer items with doc counts)
        const uniqueMap = new Map<string, Keyword>();
        allItems.forEach(item => {
            const existing = uniqueMap.get(item.keyword);
            if (!existing) {
                uniqueMap.set(item.keyword, item);
            } else {
                // Prefer the one with document count data
                if (item.total_doc_cnt != null && existing.total_doc_cnt == null) {
                    uniqueMap.set(item.keyword, item);
                }
            }
        });
        const uniqueItems = Array.from(uniqueMap.values());

        console.log(`[Bulk API] Total unique keywords: ${uniqueItems.length}`);

        // 4. Save to DB (Deferred Insert handles UPSERT/skipping)
        try {
            const saveResult = await bulkDeferredInsert(uniqueItems);
            console.log(`[Bulk API] DB Save result:`, saveResult);
        } catch (dbError) {
            console.error(`[Bulk API] DB save error:`, dbError);
        }

        // 5. Sort by Search Volume DESC
        uniqueItems.sort((a, b) => (b.total_search_cnt || 0) - (a.total_search_cnt || 0));

        // 6. Filter for UI display (only show >= 1000 volume)
        const DISPLAY_MIN_VOLUME = 1000;
        const displayItems = uniqueItems.filter(item => (item.total_search_cnt || 0) >= DISPLAY_MIN_VOLUME);

        console.log(`[Bulk API] Displayed: ${displayItems.length}, Saved only: ${uniqueItems.length - displayItems.length}`);

        return NextResponse.json({
            data: displayItems,
            meta: {
                totalCollected: uniqueItems.length,
                displayed: displayItems.length,
                savedOnly: uniqueItems.length - displayItems.length
            }
        });

    } catch (e: any) {
        console.error('Bulk keyword API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
