
import { getServiceSupabase } from '@/utils/supabase';
import { processSeedKeyword } from '@/utils/mining-engine';
import { fetchDocumentCount } from '@/utils/naver-api';

export async function runMiningBatch() {
    const adminDb = getServiceSupabase();

    try {
        const results: any = {
            success: true,
            fillDocs: null,
            expand: null
        };

        // 🎯 전략: 한 번 실행에 두 작업 모두 수행
        // 1. FILL_DOCS (소량 - 10개)
        // 2. EXPAND (1개 시드)

        // === STEP 1: FILL_DOCS (90개로 증가 - 대량 병렬 처리 + Bulk Update) ===
        // Optimized: Parallel processing + Single DB Round-trip
        const BATCH_SIZE = 90;
        const { data: docsToFill, error: docsError } = await adminDb
            .from('keywords')
            .select('id, keyword, total_search_cnt')
            .is('total_doc_cnt', null)
            .order('total_search_cnt', { ascending: false })
            .limit(BATCH_SIZE) as { data: any[] | null, error: any };

        if (!docsError && docsToFill && docsToFill.length > 0) {
            console.log(`[Batch] FILL_DOCS: Processing ${docsToFill.length} items (Chunks of 15)`);

            // 1. Fetch data in chunks to prevent 429 Storm
            // We have ~9 keys. 15 concurrent requests is safe (approx 1.6 req/key).
            // Total 90 items = 6 chunks.
            const CHUNK_SIZE = 15;
            let processedResults: any[] = [];

            for (let i = 0; i < docsToFill.length; i += CHUNK_SIZE) {
                const chunk = docsToFill.slice(i, i + CHUNK_SIZE);
                const chunkResults = await Promise.all(
                    chunk.map(async (item) => {
                        try {
                            const counts = await fetchDocumentCount(item.keyword);
                            return { status: 'fulfilled', item, counts };
                        } catch (e: any) {
                            console.error(`[Batch] Error filling ${item.keyword}: ${e.message}`);
                            return { status: 'rejected', keyword: item.keyword, error: e.message };
                        }
                    })
                );
                processedResults = [...processedResults, ...chunkResults];
            }

            const succeeded = processedResults.filter(r => r.status === 'fulfilled');
            const failed = processedResults.filter(r => r.status === 'rejected');

            // 2. Prepare Bulk Upsert Data
            const updates = succeeded.map((res: any) => {
                const { item, counts } = res;
                const viewDocCnt = (counts.blog || 0) + (counts.cafe || 0) + (counts.web || 0);
                let ratio = 0;
                let tier = 'UNRANKED';

                if (viewDocCnt > 0) {
                    ratio = item.total_search_cnt / viewDocCnt;
                    if (viewDocCnt <= 100 && ratio > 5) tier = '1등급';
                    else if (ratio > 10) tier = '2등급';
                    else if (ratio > 5) tier = '3등급';
                    else if (ratio > 1) tier = '4등급';
                    else tier = '5등급';
                } else if (item.total_search_cnt > 0) {
                    tier = '1등급';
                    ratio = 99.99;
                }

                return {
                    id: item.id,
                    keyword: item.keyword,
                    total_search_cnt: item.total_search_cnt, // Include to match schema if needed, though not updating
                    total_doc_cnt: counts.total,
                    blog_doc_cnt: counts.blog,
                    cafe_doc_cnt: counts.cafe,
                    web_doc_cnt: counts.web,
                    news_doc_cnt: counts.news,
                    golden_ratio: ratio,
                    tier: tier,
                    updated_at: new Date().toISOString()
                };
            });

            // 3. Execute Single Bulk Update
            if (updates.length > 0) {
                const { error: upsertError } = await (adminDb as any)
                    .from('keywords')
                    .upsert(updates, { onConflict: 'id' });

                if (upsertError) {
                    console.error('[Batch] Bulk Upsert Error:', upsertError);
                    // Consider them failed if DB save fails
                    results.fillDocs = {
                        processed: 0,
                        failed: docsToFill.length,
                        errors: [`Bulk Save Failed: ${upsertError.message}`]
                    };
                } else {
                    results.fillDocs = {
                        processed: updates.length,
                        failed: failed.length,
                        errors: failed.slice(0, 3).map((f: any) => `${f.keyword}: ${f.error}`)
                    };
                }
            } else {
                results.fillDocs = {
                    processed: 0,
                    failed: failed.length,
                    errors: failed.slice(0, 3).map((f: any) => `${f.keyword}: ${f.error}`)
                };
            }
        }

        // === STEP 2: EXPAND (5개 시드 - 초고속 확장 모드) ===
        // Strategy: Pure Discovery. Fetch 5 seeds, skip doc count (defer to FILL_DOCS).
        // This maximizes "Total Keywords" growth.
        const { data: seeds, error: seedError } = await adminDb
            .from('keywords')
            .select('id, keyword, total_search_cnt')
            .eq('is_expanded', false)
            .gte('total_search_cnt', 100)
            .order('total_search_cnt', { ascending: false })
            .limit(5) as { data: any[] | null, error: any }; // Process 5 seeds at once

        if (!seedError && seeds && seeds.length > 0) {
            console.log(`[Batch] EXPAND: Processing ${seeds.length} seeds (Discovery Mode)`);

            const expandResults = await Promise.all(
                seeds.map(async (seed) => {
                    // Optimistic lock
                    const { error: lockError } = await (adminDb as any)
                        .from('keywords')
                        .update({ is_expanded: true })
                        .eq('id', seed.id)
                        .eq('is_expanded', false);

                    if (lockError) return { status: 'skipped', seed: seed.keyword };

                    try {
                        // limitDocCount=0, skipDocFetch=true, minVolume=100
                        // Only fetches related keywords and saves them. No search API usage here.
                        const res = await processSeedKeyword(seed.keyword, 0, true, 100);

                        // Mark as fully expanded
                        await (adminDb as any).from('keywords').update({ is_expanded: true }).eq('id', seed.id);

                        return { status: 'fulfilled', seed: seed.keyword, saved: res.saved };
                    } catch (e: any) {
                        // Rollback
                        await (adminDb as any).from('keywords').update({ is_expanded: false }).eq('id', seed.id);
                        return { status: 'rejected', seed: seed.keyword, error: e.message };
                    }
                })
            );

            const succeeded = expandResults.filter(r => r.status === 'fulfilled');

            results.expand = {
                processedSeeds: seeds.length,
                totalSaved: succeeded.reduce((sum, r: any) => sum + (r.saved || 0), 0),
                details: expandResults.map((r: any) =>
                    r.status === 'fulfilled' ? `${r.seed} (+${r.saved})` : `${r.seed} (${r.status})`
                )
            };
        }

        // 결과 반환
        return results;

    } catch (e: any) {
        console.error('Batch Error:', e);
        return {
            success: false,
            error: e.message
        };
    }
}
