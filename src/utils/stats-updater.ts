import { getTursoClient, getCurrentTimestamp } from '@/utils/turso';

export async function updateSystemStats() {
    const db = getTursoClient();
    console.log('[StatsUpdater] 🚀 Starting background stats aggregation...');

    // 1. Ensure Table Exists
    await db.execute(`
        CREATE TABLE IF NOT EXISTS stats_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    try {
        // 2. Run Heavy Queries
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [mainStatsResult, tierStatsResult, seedStatsResult, newStatsResult] = await Promise.all([
            // Total & Analyzed
            db.execute(`SELECT 
                COUNT(*) as total, 
                SUM(CASE WHEN total_doc_cnt >= 0 THEN 1 ELSE 0 END) as analyzed, 
                SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as expanded 
                FROM keywords`),

            // Tiers
            db.execute('SELECT tier, COUNT(*) as count FROM keywords GROUP BY tier'),

            // Seeds
            db.execute(`SELECT is_expanded, COUNT(*) as count FROM keywords WHERE total_search_cnt >= 100 GROUP BY is_expanded`),

            // 24h Trends
            db.execute(`SELECT 
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new24h, 
                SUM(CASE WHEN total_doc_cnt >= 0 AND updated_at >= ? THEN 1 ELSE 0 END) as docs24h 
                FROM keywords`, [since24h, since24h])
        ]);

        // 3. Process Results
        const tiers: Record<string, number> = {};
        tierStatsResult.rows.forEach(row => {
            tiers[String(row.tier).toLowerCase()] = Number(row.count);
        });

        const seeds = {
            total: 0,
            pending: 0,
            expanded: 0,
            processing: 0
        };
        seedStatsResult.rows.forEach(row => {
            const count = Number(row.count);
            seeds.total += count;
            const status = Number(row.is_expanded);
            if (status === 0) seeds.pending = count;
            else if (status === 1) seeds.expanded = count;
            else if (status === 2) seeds.processing = count;
        });

        const statsData = {
            total: Number(mainStatsResult.rows[0]?.total || 0),
            analyzed: Number(mainStatsResult.rows[0]?.analyzed || 0),
            expanded: Number(mainStatsResult.rows[0]?.expanded || 0),
            tiers,
            seeds,
            counts24h: {
                new: Number(newStatsResult.rows[0]?.new24h || 0),
                docs: Number(newStatsResult.rows[0]?.docs24h || 0)
            },
            last_updated: getCurrentTimestamp()
        };

        // 4. Save to Cache
        await db.execute({
            sql: `INSERT INTO stats_cache (key, value, updated_at) VALUES ('monitor_stats', ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            args: [JSON.stringify(statsData), getCurrentTimestamp()]
        });

        console.log('[StatsUpdater] ✅ Stats updated successfully:', statsData.last_updated);
        return { success: true, timestamp: statsData.last_updated };

    } catch (e: any) {
        console.error('[StatsUpdater] ❌ Failed to update stats:', e);
        throw e;
    }
}
