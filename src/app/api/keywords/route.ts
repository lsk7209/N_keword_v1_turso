
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/utils/turso';

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

    const db = getTursoClient();
    const requiresDocs = ['cafe_asc', 'blog_asc', 'web_asc', 'news_asc', 'tier_desc', 'tier_asc'].includes(sort);

    // Build WHERE clause
    let whereClause = '';
    if (requiresDocs) {
        whereClause = 'WHERE total_doc_cnt IS NOT NULL';
    }

    // Build ORDER BY clause
    let orderBy = '';
    if (sort === 'tier_desc') {
        orderBy = 'ORDER BY tier ASC, golden_ratio DESC';
    } else if (sort === 'tier_asc') {
        orderBy = 'ORDER BY tier DESC, golden_ratio ASC';
    } else if (sort === 'opp_desc') {
        orderBy = 'ORDER BY golden_ratio DESC';
    } else if (sort === 'cafe_asc') {
        orderBy = 'ORDER BY cafe_doc_cnt ASC, total_search_cnt DESC';
    } else if (sort === 'blog_asc') {
        orderBy = 'ORDER BY blog_doc_cnt ASC, total_search_cnt DESC';
    } else if (sort === 'web_asc') {
        orderBy = 'ORDER BY web_doc_cnt ASC, total_search_cnt DESC';
    } else if (sort === 'news_asc') {
        orderBy = 'ORDER BY news_doc_cnt ASC, total_search_cnt DESC';
    } else {
        orderBy = 'ORDER BY total_search_cnt DESC';
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM keywords ${whereClause}`;
    const countResult = await db.execute(countSql);
    const total = countResult.rows[0]?.count as number || 0;

    // Get data with pagination
    const dataSql = `SELECT * FROM keywords ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const dataResult = await db.execute({
        sql: dataSql,
        args: [limit, cursor]
    });

    const data = dataResult.rows.map(row => ({
        id: row.id,
        keyword: row.keyword,
        total_search_cnt: row.total_search_cnt,
        pc_search_cnt: row.pc_search_cnt,
        mo_search_cnt: row.mo_search_cnt,
        click_cnt: row.click_cnt,
        ctr: row.ctr,
        comp_idx: row.comp_idx,
        pl_avg_depth: row.pl_avg_depth,
        avg_bid_price: row.avg_bid_price,
        total_doc_cnt: row.total_doc_cnt,
        blog_doc_cnt: row.blog_doc_cnt,
        cafe_doc_cnt: row.cafe_doc_cnt,
        web_doc_cnt: row.web_doc_cnt,
        news_doc_cnt: row.news_doc_cnt,
        tier: row.tier,
        golden_ratio: row.golden_ratio,
        is_expanded: row.is_expanded === 1,
        created_at: row.created_at,
        updated_at: row.updated_at
    }));

    const nextCursor = (data && data.length === limit) ? cursor + limit : null;

    return NextResponse.json({
        data,
        nextCursor,
        total
    });
}
