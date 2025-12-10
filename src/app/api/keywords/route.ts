
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

// Helper for approximate count if needed, but Supabase count('exact') is okay for < 1M usually.
// Or restrict count to filtered set.

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const cursor = parseInt(searchParams.get('cursor') || '0');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'search_desc'; // search_desc or opp_desc
    // Filters could be added here

    let query = supabase
        .from('keywords')
        .select('*', { count: 'estimated' });

    // Sorting
    if (sort === 'opp_desc') {
        // "Empty house" = Low Docs + High Search.
        // Golden Ratio = Search / Docs.
        // Sort by golden_ratio desc
        query = query.order('golden_ratio', { ascending: false });
    } else {
        // search_desc
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
