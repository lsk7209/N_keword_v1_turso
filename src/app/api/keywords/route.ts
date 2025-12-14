
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Cache for 60 seconds


// Helper for approximate count if needed, but Supabase count('exact') is okay for < 1M usually.
// Or restrict count to filtered set.

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get('CRON_SECRET');
    const queryKey = searchParams.get('key');
    const secret = process.env.CRON_SECRET;

    // 인증이 제공된 경우에만 검증 (선택적 인증)
    // 인증 없이도 공개 데이터 조회 가능
    if (secret && (authHeader || queryKey)) {
        // 인증 정보가 제공되었지만 일치하지 않는 경우에만 거부
        if (authHeader !== secret && queryKey !== secret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const cursor = parseInt(searchParams.get('cursor') || '0');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'search_desc'; // search_desc, opp_desc, cafe_asc, blog_asc, web_asc, news_asc, tier_desc
    // Filters could be added here

    let query = supabase
        .from('keywords')
        .select('*', { count: 'estimated' });

    const requiresDocs = ['cafe_asc', 'blog_asc', 'web_asc', 'news_asc', 'tier_desc', 'tier_asc'].includes(sort);
    if (requiresDocs) {
        query = query.not('total_doc_cnt', 'is', null);
    }

    // Sorting
    if (sort === 'tier_desc') {
        // Tier 순서: DIAMOND > PLATINUM > GOLD > SILVER > BRONZE > UNRANKED (내림차순)
        query = query
            .order('tier', { ascending: true })
            .order('golden_ratio', { ascending: false });
    } else if (sort === 'tier_asc') {
        // Tier 순서: BRONZE > SILVER > GOLD > PLATINUM > DIAMOND (오름차순)
        query = query
            .order('tier', { ascending: false })
            .order('golden_ratio', { ascending: true });
    } else if (sort === 'opp_desc') {
        // "Empty house" = Low Docs + High Search.
        // Golden Ratio = Search / Docs.
        // Sort by golden_ratio desc
        query = query.order('golden_ratio', { ascending: false });
    } else if (sort === 'cafe_asc') {
        query = query
            .order('cafe_doc_cnt', { ascending: true, nullsFirst: false })
            .order('total_search_cnt', { ascending: false });
    } else if (sort === 'blog_asc') {
        query = query
            .order('blog_doc_cnt', { ascending: true, nullsFirst: false })
            .order('total_search_cnt', { ascending: false });
    } else if (sort === 'web_asc') {
        query = query
            .order('web_doc_cnt', { ascending: true, nullsFirst: false })
            .order('total_search_cnt', { ascending: false });
    } else if (sort === 'news_asc') {
        query = query
            .order('news_doc_cnt', { ascending: true, nullsFirst: false })
            .order('total_search_cnt', { ascending: false });
    } else {
        // default: search_desc
        query = query.order('total_search_cnt', { ascending: false });
    }

    // Pagination via range (offset)
    query = query.range(cursor, cursor + limit - 1);

    const { data, count, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextCursor = (data && data.length === limit) ? cursor + limit : null;

    return NextResponse.json({
        data,
        nextCursor,
        total: count
    });
}
