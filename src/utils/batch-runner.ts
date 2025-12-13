
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

        // === STEP 1: FILL_DOCS (30개로 증가 - 공격적 모드) ===
        const { data: docsToFill, error: docsError } = await adminDb
            .from('keywords')
            .select('id, keyword, total_search_cnt')
            .is('total_doc_cnt', null)
            .order('total_search_cnt', { ascending: false })
            .limit(30) as { data: any[] | null, error: any };  // 10 → 30 증가

        if (!docsError && docsToFill && docsToFill.length > 0) {
            console.log(`[Batch] FILL_DOCS: Processing ${docsToFill.length} items`);
            const processed: string[] = [];
            const errors: string[] = [];

            for (const item of docsToFill) {
                try {
                    const counts = await fetchDocumentCount((item as any).keyword);

                    // Golden Ratio: 검색량 / (블로그 + 카페 + 웹 문서수)
                    // 뉴스는 제외 (SEO 경쟁 지표로 부적합)
                    const viewDocCnt = (counts.blog || 0) + (counts.cafe || 0) + (counts.web || 0);
                    let ratio = 0;
                    let tier = 'UNRANKED';

                    if (viewDocCnt > 0) {
                        ratio = (item as any).total_search_cnt / viewDocCnt;
                        if (ratio > 10) tier = 'PLATINUM';
                        else if (ratio > 5) tier = 'GOLD';
                        else if (ratio > 1) tier = 'SILVER';
                        else tier = 'BRONZE';
                    } else if ((item as any).total_search_cnt > 0) {
                        tier = 'PLATINUM';
                        ratio = 99.99;
                    }

                    await (adminDb as any)
                        .from('keywords')
                        .update({
                            total_doc_cnt: counts.total,
                            blog_doc_cnt: counts.blog,
                            cafe_doc_cnt: counts.cafe,
                            web_doc_cnt: counts.web,
                            news_doc_cnt: counts.news,
                            golden_ratio: ratio,
                            tier: tier,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', (item as any).id);

                    processed.push((item as any).keyword);
                } catch (e: any) {
                    errors.push(`${(item as any).keyword}: ${e.message}`);
                }
            }

            results.fillDocs = {
                processed: processed.length,
                failed: errors.length,
                errors: errors.slice(0, 3)
            };
        }

        // === STEP 2: EXPAND (1개 시드) ===
        const { data: seeds, error: seedError } = await adminDb
            .from('keywords')
            .select('id, keyword, total_search_cnt')
            .eq('is_expanded', false)
            .gte('total_search_cnt', 1000)
            .order('total_search_cnt', { ascending: false })
            .limit(1) as { data: any[] | null, error: any };

        if (!seedError && seeds && seeds.length > 0) {
            const seed = seeds[0];
            console.log(`[Batch] EXPAND: Seed = ${seed.keyword}`);

            // Optimistic lock
            const { error: lockError } = await (adminDb as any)
                .from('keywords')
                .update({ is_expanded: true })
                .eq('id', seed.id)
                .eq('is_expanded', false);

            if (!lockError) {
                try {
                    const expandResult = await processSeedKeyword(seed.keyword, 10); // 문서 수 10개 (기존: 5개)
                    await (adminDb as any).from('keywords').update({ is_expanded: true }).eq('id', seed.id);

                    results.expand = {
                        seed: seed.keyword,
                        processed: expandResult.processed,
                        saved: expandResult.saved
                    };
                } catch (e: any) {
                    // Rollback
                    await (adminDb as any).from('keywords').update({ is_expanded: false }).eq('id', seed.id);
                    results.expand = {
                        seed: seed.keyword,
                        error: e.message
                    };
                }
            }
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
