
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/utils/supabase'; // admin client
import { processSeedKeyword } from '@/utils/mining-engine';

// Set Vercel Function config
export const maxDuration = 60; // 60 seconds strict
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. Auth Check
    const authHeader = req.headers.get('CRON_SECRET');
    if (authHeader !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminDb = getServiceSupabase();

    try {
        // Detect Job Mode: FILL_DOCS vs EXPAND
        // Prioritize Filling Docs because user wants "auto start" of doc collection after manual mining.

        // Check for missing doc counts
        const { data: missingDocs, error: missingError } = await adminDb
            .from('keywords')
            .select('*')
            .is('total_doc_cnt', null)
            .limit(10); // Process 10 at a time to stay within 60s

        if (missingError) throw missingError;

        if (missingDocs && missingDocs.length > 0) {
            console.log(`[Cron] Mode: FILL_DOCS (${missingDocs.length} items)`);
            const results = [];
            const { fetchDocumentCount } = await import('@/utils/naver-api');

            for (const item of missingDocs) {
                try {
                    const counts = await fetchDocumentCount(item.keyword);
                    // Update DB with docs + ratio + tier
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
            }

            return NextResponse.json({
                success: true,
                mode: 'FILL_DOCS',
                processed: results.length,
                items: results
            });
        }

        // 2. Fetch Job: Expansion Seed
        // Logic: prioritize "Expandable" (is_expanded=false and volume >= 1000)
        let seedKeywords: any[] = [];

        const { data: seeds, error: seedError } = await adminDb
            .from('keywords')
            .select('*')
            .eq('is_expanded', false)
            .gte('total_search_cnt', 1000)
            .order('total_search_cnt', { ascending: false })
            .limit(1);

        if (seedError) throw seedError;

        if (!seeds || seeds.length === 0) {
            return NextResponse.json({ message: 'No work found' });
        }

        const seed = seeds[0];
        console.log(`[Cron] Mode: EXPAND (Seed: ${seed.keyword})`);

        // 3. Process Seed using shared engine
        // Limit full document processing to top 20 to avoid timeout.
        // The rest are saved as "deferred" and will be picked up by FILL_DOCS logic later.
        const result = await processSeedKeyword(seed.keyword, 20);

        // 4. Mark seed as expanded
        await adminDb.from('keywords').update({ is_expanded: true }).eq('id', seed.id);

        return NextResponse.json({
            success: true,
            mode: 'EXPAND',
            seed: seed.keyword,
            processed: result.processed,
            saved: result.saved
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
