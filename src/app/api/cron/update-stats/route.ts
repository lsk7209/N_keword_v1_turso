import { NextResponse } from 'next/server';
import { getTursoClient } from '@/utils/turso';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 60s for calculation

export async function GET(request: Request) {
    // Optional: Add manual Cron verification logic here (e.g., Check Authorization header)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return new Response('Unauthorized', { status: 401 });
    // }

    const db = getTursoClient();
    console.log('[Cron] 📊 Updating Global Stats Cache...');

    try {
        // 1. Create table if not exists (Safety)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS stats_cache (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT
            )
        `);

        // 2. Calculate Stats (Expensive Queries)
        const totalRes = await db.execute("SELECT COUNT(*) as c FROM keywords");
        const analyzedRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL");
        const expandedRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 1");

        const platinumRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'PLATINUM'");
        const goldRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'GOLD'");
        const silverRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'SILVER'");
        const bronzeRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'BRONZE'");

        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const newStatsRes = await db.execute({
            sql: `SELECT 
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new24h,
                SUM(CASE WHEN total_doc_cnt >= 0 AND updated_at >= ? THEN 1 ELSE 0 END) as docs24h
            FROM keywords`,
            args: [since24h, since24h]
        });

        const seedStatsRes = await db.execute(`
            SELECT is_expanded, COUNT(*) as count 
            FROM keywords 
            WHERE total_search_cnt >= 100 
            GROUP BY is_expanded
        `);

        let seedPending = 0;
        let seedExpanded = 0;
        let seedProcessing = 0;

        seedStatsRes.rows.forEach(row => {
            const s = Number(row.is_expanded);
            const c = Number(row.count);
            if (s === 0) seedPending = c;
            else if (s === 1) seedExpanded = c;
            else if (s === 2) seedProcessing = c;
        });

        const stats = {
            total: totalRes.rows[0].c,
            analyzed: analyzedRes.rows[0].c,
            expanded: expandedRes.rows[0].c,
            tiers: {
                platinum: platinumRes.rows[0].c,
                gold: goldRes.rows[0].c,
                silver: silverRes.rows[0].c,
                bronze: bronzeRes.rows[0].c
            },
            counts24h: {
                new: newStatsRes.rows[0].new24h || 0,
                docs: newStatsRes.rows[0].docs24h || 0
            },
            seeds: {
                pending: seedPending,
                expanded: seedExpanded,
                processing: seedProcessing,
                total: seedPending + seedExpanded + seedProcessing
            },
            last_updated: new Date().toISOString()
        };

        // 3. Save to Cache
        await db.execute({
            sql: "INSERT OR REPLACE INTO stats_cache (key, value, updated_at) VALUES (?, ?, datetime('now'))",
            args: ['monitor_stats', JSON.stringify(stats)]
        });

        console.log('[Cron] ✅ Stats Updated Successfully!');
        return NextResponse.json({ success: true, stats });

    } catch (error: any) {
        console.error('[Cron] ❌ Update failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
