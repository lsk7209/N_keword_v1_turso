import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/utils/turso';

export const dynamic = 'force-dynamic';

function escapeCsv(value: unknown) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get('CRON_SECRET');
    const queryKey = searchParams.get('key');
    const secret = process.env.CRON_SECRET;

    // Optional auth (same behavior as /api/keywords)
    if (secret && (authHeader || queryKey)) {
        if (authHeader !== secret && queryKey !== secret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    // Support both cursor-based and page-based pagination
    const page = parseInt(searchParams.get('page') || '0');
    const cursor = page > 0 ? (page - 1) * 100 : parseInt(searchParams.get('cursor') || '0');
    // Allow larger chunks for "full export" parts, but keep it bounded for Vercel/time/memory safety.
    const rawLimit = parseInt(searchParams.get('limit') || '100');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(5000, rawLimit)) : 100;
    const sort = searchParams.get('sort') || 'search_desc';
    const part = parseInt(searchParams.get('part') || '1');
    const minSearchVolumeParam = searchParams.get('minSearchVolume');
    const minSearchVolume = minSearchVolumeParam ? parseInt(minSearchVolumeParam, 10) : null;

    const db = getTursoClient();
    // 문서수가 필요한 정렬: 등급순, 카페/블로그/웹/뉴스 적은순 (전체 조회 제외)
    const requiresDocs = ['tier_desc', 'tier_asc', 'cafe_asc', 'blog_asc', 'web_asc', 'news_asc'].includes(sort);

    // Build WHERE clause (keywords/route.ts와 동일한 로직)
    const whereConditions: string[] = [];
    
    // 문서수 필터 (정렬에 따라)
    if (requiresDocs) {
        if (sort === 'cafe_asc') {
            // 카페 적은순: 카페 문서수가 0이 아닌 것만 (NULL도 제외)
            whereConditions.push('total_doc_cnt IS NOT NULL AND cafe_doc_cnt > 0');
        } else if (sort === 'blog_asc') {
            // 블로그 적은순: 블로그 문서수가 0이 아닌 것만
            whereConditions.push('total_doc_cnt IS NOT NULL AND blog_doc_cnt > 0');
        } else if (sort === 'web_asc') {
            // 웹 적은순: 웹 문서수가 0이 아닌 것만
            whereConditions.push('total_doc_cnt IS NOT NULL AND web_doc_cnt > 0');
        } else if (sort === 'news_asc') {
            // 뉴스 적은순: 뉴스 문서수가 0이 아닌 것만
            whereConditions.push('total_doc_cnt IS NOT NULL AND news_doc_cnt > 0');
        } else {
            // 등급순: 문서수가 있는 것만 (total_doc_cnt IS NOT NULL)
            whereConditions.push('total_doc_cnt IS NOT NULL');
        }
    }
    
    // 총검색량 필터
    if (minSearchVolume !== null && !isNaN(minSearchVolume) && minSearchVolume > 0) {
        whereConditions.push(`total_search_cnt >= ${minSearchVolume}`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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

    const dataSql = `SELECT * FROM keywords ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const dataResult = await db.execute({
        sql: dataSql,
        args: [limit, cursor]
    });

    const rows = dataResult.rows.map(row => ({
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
    const nextCursor = rows.length === limit ? cursor + limit : null;

    // Columns (Excel-friendly CSV)
    const header = [
        'keyword',
        'total_search_cnt',
        'blog_doc_cnt',
        'cafe_doc_cnt',
        'web_doc_cnt',
        'news_doc_cnt',
        'total_doc_cnt',
        'golden_ratio',
        'tier',
        'pc_search_cnt',
        'mo_search_cnt',
        'pc_click_cnt',
        'mo_click_cnt',
        'pc_ctr',
        'mo_ctr',
        'comp_idx',
        'pl_avg_depth',
        'updated_at',
        'created_at'
    ];

    const lines = [
        header.join(','),
        ...rows.map((r: Record<string, unknown>) => header.map((k) => escapeCsv(r?.[k])).join(','))
    ];

    // Add UTF-8 BOM so Excel opens Korean reliably
    const csv = `\ufeff${lines.join('\n')}`;
    const calculatedPage = page > 0 ? page : Math.floor(cursor / Math.max(1, limit)) + 1;
    const safePart = Number.isFinite(part) ? Math.max(1, Math.min(99999, part)) : 1;
    const filename = nextCursor !== null
        ? `keywords_export_part${safePart}_limit${limit}_sort_${sort}.csv`
        : `keywords_export_final_part${safePart}_limit${limit}_sort_${sort}.csv`;

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
            // Let browser JS read these headers (for multi-part export).
            'Access-Control-Expose-Headers': 'X-Next-Cursor, X-Export-Limit, X-Export-Count',
            'X-Next-Cursor': nextCursor === null ? '' : String(nextCursor),
            'X-Export-Limit': String(limit),
            'X-Export-Count': String(rows.length),
        }
    });
}



