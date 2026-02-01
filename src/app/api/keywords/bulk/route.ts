import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount } from '@/utils/naver-api';
import { calculateTierAndRatio, processSeedKeyword, bulkDeferredInsert, Keyword } from '@/utils/mining-engine';

export const dynamic = 'force-dynamic';

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

        // 2. Process each seed using Mining Engine (Max 100 related, Top 30 docs)
        const LIMIT_DOC_COUNT = 30;
        const MAX_KEYWORDS = 100;
        const MIN_VOLUME = 10;

        const allItems: any[] = [];

        for (const seed of seeds) {
            try {
                // Fetch related + docs for top N
                const result = await processSeedKeyword(
                    seed,
                    LIMIT_DOC_COUNT,
                    false,
                    MIN_VOLUME,
                    MAX_KEYWORDS
                );

                if (result.items && result.items.length > 0) {
                    allItems.push(...result.items);
                }
            } catch (error) {
                console.error(`Bulk mining failed for seed: ${seed}`, error);
            }
        }

        if (allItems.length === 0) {
            return NextResponse.json({ data: [] });
        }

        // 3. Deduplicate
        const uniqueMap = new Map<string, any>();
        allItems.forEach(item => {
            const existing = uniqueMap.get(item.keyword);
            if (!existing) {
                uniqueMap.set(item.keyword, item);
            } else {
                if (item.total_doc_cnt && !existing.total_doc_cnt) {
                    uniqueMap.set(item.keyword, item);
                }
            }
        });
        const uniqueItems = Array.from(uniqueMap.values());

        // 4. Save to DB (Deferred Insert logic handles UPSERT/skipping)
        // Note: bulkDeferredInsert returns { inserted, updated, skipped }
        await bulkDeferredInsert(uniqueItems);

        // 5. Sort by Search Volume DESC
        uniqueItems.sort((a, b) => (b.total_search_cnt || 0) - (a.total_search_cnt || 0));

        return NextResponse.json({ data: uniqueItems });

    } catch (e: any) {
        console.error('Bulk keyword API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
