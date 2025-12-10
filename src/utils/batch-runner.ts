
import { getServiceSupabase } from '@/utils/supabase';
import { processSeedKeyword } from '@/utils/mining-engine';
import { fetchDocumentCount } from '@/utils/naver-api';

export async function runMiningBatch() {
    const adminDb = getServiceSupabase();
    const logs: string[] = [];

    const log = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    try {
        // 1. FILL_DOCS Mode
        const { data: missingDocs, error: missingError } = await adminDb
            .from('keywords')
            .select('*')
            .is('total_doc_cnt', null)
            .limit(20); // Optimized limit

        if (missingError) throw missingError;

        if (missingDocs && missingDocs.length > 0) {
            log(`[Batch] Mode: FILL_DOCS (${missingDocs.length} items)`);
            const results = [];

            // Parallel Process
            // Limit concurrency if needed, but 20 is fine for 9 keys?
            // Let's do batch of 5 to be safe with rate limits although we have retry logic.
            const BATCH_SIZE = 5;
            for (let i = 0; i < missingDocs.length; i += BATCH_SIZE) {
                const chunk = missingDocs.slice(i, i + BATCH_SIZE);
                await Promise.all(chunk.map(async (item) => {
                    try {
                        const counts = await fetchDocumentCount(item.keyword);

                        const viewDocCnt = (counts.blog || 0) + (counts.cafe || 0);
                        let ratio = 0;
                        let tier = 'UNRANKED';

                        if (viewDocCnt > 0) {
                            ratio = item.total_search_cnt / viewDocCnt;
                            if (ratio > 10) tier = 'PLATINUM';
                            else if (ratio > 5) tier = 'GOLD';
                            else if (ratio > 1) tier = 'SILVER';
                            else tier = 'BRONZE';
                        } else if (item.total_search_cnt > 0) {
                            tier = 'PLATINUM';
                            ratio = 99.99;
                        }

                        const { error: updateError } = await adminDb
                            .from('keywords')
                            .update({
                                total_doc_cnt: counts.total,
                                blog_doc_cnt: counts.blog,
                                cafe_doc_cnt: counts.cafe,
                                web_doc_cnt: counts.web,
                                news_doc_cnt: counts.news,
                                golden_ratio: ratio,
                                tier: tier
                            })
                            .eq('id', item.id);

                        if (updateError) console.error('Update Error:', updateError);
                        else results.push(item.keyword);
                    } catch (e: any) {
                        console.error(`Doc fetch failed for ${item.keyword}:`, e);
                    }
                }));
            }

            return {
                success: true,
                mode: 'FILL_DOCS',
                processed: results.length,
                items: results,
                logs
            };
        }

        // 2. EXPAND Mode
        const { data: seeds, error: seedError } = await adminDb
            .from('keywords')
            .select('*')
            .eq('is_expanded', false)
            .gte('total_search_cnt', 1000)
            .order('total_search_cnt', { ascending: false })
            .limit(1);

        if (seedError) throw seedError;

        if (!seeds || seeds.length === 0) {
            return {
                success: true,
                mode: 'IDLE',
                message: 'No work found',
                logs
            };
        }

        const seed = seeds[0];
        log(`[Batch] Mode: EXPAND (Seed: ${seed.keyword})`);

        const result = await processSeedKeyword(seed.keyword, 20); // 20 docs immediate

        await adminDb.from('keywords').update({ is_expanded: true }).eq('id', seed.id);

        return {
            success: true,
            mode: 'EXPAND',
            seed: seed.keyword,
            processed: result.processed,
            saved: result.saved,
            logs
        };

    } catch (e: any) {
        console.error('Batch Error:', e);
        return {
            success: false,
            error: e.message,
            logs
        };
    }
}
