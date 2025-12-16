import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

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

    const cursor = parseInt(searchParams.get('cursor') || '0');
    // Allow larger chunks for "full export" parts, but keep it bounded for Vercel/time/memory safety.
    const rawLimit = parseInt(searchParams.get('limit') || '100');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(5000, rawLimit)) : 100;
    const sort = searchParams.get('sort') || 'search_desc';
    const part = parseInt(searchParams.get('part') || '1');

    let query = supabase
        .from('keywords')
        .select('*');

    const requiresDocs = ['cafe_asc', 'blog_asc', 'web_asc', 'news_asc', 'tier_desc', 'tier_asc'].includes(sort);
    if (requiresDocs) {
        query = query.not('total_doc_cnt', 'is', null);
    }

    // Sorting (keep consistent with /api/keywords)
    if (sort === 'tier_desc') {
        query = query.order('tier', { ascending: true }).order('golden_ratio', { ascending: false });
    } else if (sort === 'tier_asc') {
        query = query.order('tier', { ascending: false }).order('golden_ratio', { ascending: true });
    } else if (sort === 'opp_desc') {
        query = query.order('golden_ratio', { ascending: false });
    } else if (sort === 'cafe_asc') {
        query = query.order('cafe_doc_cnt', { ascending: true, nullsFirst: false }).order('total_search_cnt', { ascending: false });
    } else if (sort === 'blog_asc') {
        query = query.order('blog_doc_cnt', { ascending: true, nullsFirst: false }).order('total_search_cnt', { ascending: false });
    } else if (sort === 'web_asc') {
        query = query.order('web_doc_cnt', { ascending: true, nullsFirst: false }).order('total_search_cnt', { ascending: false });
    } else if (sort === 'news_asc') {
        query = query.order('news_doc_cnt', { ascending: true, nullsFirst: false }).order('total_search_cnt', { ascending: false });
    } else {
        query = query.order('total_search_cnt', { ascending: false });
    }

    query = query.range(cursor, cursor + limit - 1);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
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
    const page = Math.floor(cursor / Math.max(1, limit)) + 1;
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


