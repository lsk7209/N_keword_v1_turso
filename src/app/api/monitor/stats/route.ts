
import { NextResponse } from 'next/server';
import { getTursoClient } from '@/utils/turso';
import { keyManager } from '@/utils/key-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
    const db = getServiceSupabase();

    try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Total Keywords
        const totalResult = await db.execute('SELECT COUNT(*) as count FROM keywords');
        const total = totalResult.rows[0]?.count as number || 0;

        // 2. Pending Doc Count (Queue)
        const qDocResult = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NULL');
        const qDoc = qDocResult.rows[0]?.count as number || 0;

        // 3. Pending Expansion (Seeds) - High Volume Only
        const qSeedResult = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 1000',
            args: []
        });
        const qSeed = qSeedResult.rows[0]?.count as number || 0;

        // 3b. Last 24h throughput
        const newKeywords24hResult = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE created_at >= ?',
            args: [since24h]
        });
        const newKeywords24h = newKeywords24hResult.rows[0]?.count as number || 0;

        const docsFilled24hResult = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at >= ?',
            args: [since24h]
        });
        const docsFilled24h = docsFilled24hResult.rows[0]?.count as number || 0;

        // 4. Last Active (Latest updated_at)
        const lastActiveResult = await db.execute({
            sql: 'SELECT updated_at FROM keywords ORDER BY updated_at DESC LIMIT 1',
            args: []
        });
        const lastActive = lastActiveResult.rows.length > 0 ? { updated_at: lastActiveResult.rows[0].updated_at } : null;

        // 5. API Keys Status (based on in-memory cooldown tracking)
        const adStatus = keyManager.getStatusSummary('AD');
        const searchStatus = keyManager.getStatusSummary('SEARCH');
        const systemHealthy = adStatus.available > 0 && searchStatus.available > 0;

        return NextResponse.json({
            total_keywords: total || 0,
            pending_docs: qDoc || 0,
            pending_seeds: qSeed || 0,
            throughput_24h: {
                since: since24h,
                new_keywords: newKeywords24h || 0,
                docs_filled: docsFilled24h || 0,
                // helpful derived rates
                new_keywords_per_hour: Math.round(((newKeywords24h || 0) / 24) * 10) / 10,
                docs_filled_per_hour: Math.round(((docsFilled24h || 0) / 24) * 10) / 10,
            },
            last_activity: (lastActive as any)?.updated_at || null,
            api_keys: {
                ad: adStatus,
                search: searchStatus
            },
            status: systemHealthy ? 'HEALTHY' : 'DEGRADED'
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message, status: 'ERROR' }, { status: 500 });
    }
}
