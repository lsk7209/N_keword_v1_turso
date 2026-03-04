
import { NextResponse } from 'next/server';
import { getTursoClient } from '@/utils/turso';
import { keyManager } from '@/utils/key-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
    const db = getTursoClient();

    try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 🚀 Optimization: Use stats_cache instead of live full-table COUNT queries
        const cacheRes = await db.execute("SELECT value, updated_at FROM stats_cache WHERE key = 'monitor_stats'");

        let total = 0;
        let pending_docs = 0;
        let pending_seeds = 0;
        let newKeywords24h = 0;
        let docsFilled24h = 0;
        let lastActive = null;

        if (cacheRes.rows.length > 0 && cacheRes.rows[0].value) {
            const stats = JSON.parse(cacheRes.rows[0].value as string);
            total = stats.total || 0;
            pending_docs = Math.max((stats.total || 0) - (stats.analyzed || 0), 0);
            pending_seeds = stats.seeds?.pending || 0;
            newKeywords24h = stats.counts24h?.new || 0;
            docsFilled24h = stats.counts24h?.docs || 0;
            lastActive = stats.last_updated;
        } else {
            // Fallback (rare) if cache is empty
            const totalResult = await db.execute('SELECT COUNT(*) as count FROM keywords');
            total = totalResult.rows[0]?.count as number || 0;
            const qDocResult = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NULL');
            pending_docs = qDocResult.rows[0]?.count as number || 0;
        }

        // API Keys Status (based on in-memory cooldown tracking)
        const adStatus = keyManager.getStatusSummary('AD');
        const searchStatus = keyManager.getStatusSummary('SEARCH');
        const systemHealthy = adStatus.available > 0 && searchStatus.available > 0;

        return NextResponse.json({
            total_keywords: total,
            pending_docs: pending_docs,
            pending_seeds: pending_seeds,
            throughput_24h: {
                since: since24h,
                new_keywords: newKeywords24h,
                docs_filled: docsFilled24h,
                new_keywords_per_hour: Math.round((newKeywords24h / 24) * 10) / 10,
                docs_filled_per_hour: Math.round((docsFilled24h / 24) * 10) / 10,
            },
            last_activity: lastActive,
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
