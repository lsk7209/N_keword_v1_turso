
import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/utils/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    const db = getServiceSupabase();

    try {
        // 1. Total Keywords
        const { count: total, error: e1 } = await db.from('keywords').select('*', { count: 'exact', head: true });
        if (e1) throw e1;

        // 2. Pending Doc Count (Queue)
        const { count: qDoc, error: e2 } = await db.from('keywords').select('*', { count: 'exact', head: true }).is('total_doc_cnt', null);
        if (e2) throw e2;

        // 3. Pending Expansion (Seeds) - High Volume Only
        const { count: qSeed, error: e3 } = await db.from('keywords').select('*', { count: 'exact', head: true })
            .eq('is_expanded', false)
            .gte('total_search_cnt', 1000);
        if (e3) throw e3;

        // 4. Last Active (Latest updated_at)
        const { data: lastActive, error: e4 } = await db.from('keywords').select('updated_at').order('updated_at', { ascending: false }).limit(1).single();
        // Ignore e4 if no data, just return null date

        // 5. API Keys Status (Simulate check)
        // Since we can't persist state, we just count the configured keys from env
        const envKeys = process.env.NAVER_API_KEYS || '';
        const keyCount = envKeys.split(',').filter(k => k.includes(':')).length;

        return NextResponse.json({
            total_keywords: total || 0,
            pending_docs: qDoc || 0,
            pending_seeds: qSeed || 0,
            last_activity: lastActive?.updated_at || null,
            api_key_count: keyCount,
            status: 'HEALTHY'
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message, status: 'ERROR' }, { status: 500 });
    }
}
