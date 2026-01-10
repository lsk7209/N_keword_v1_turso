import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { getTursoClient } from '../src/utils/turso';

async function updateStats() {
    const db = getTursoClient();
    console.log('📊 Updating Global Stats Cache...');

    // 1. Create table if not exists
    await db.execute(`
        CREATE TABLE IF NOT EXISTS stats_cache (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        )
    `);

    // 2. Calculate Stats (Expensive Queries run here, ONCE per 10 mins)
    console.log('   Calculating total counts...');

    // Optimized: Run in parallel where possible, but Turso handle might prefer sequential if sharing connection
    const totalRes = await db.execute("SELECT COUNT(*) as c FROM keywords");
    const analyzedRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL");
    const expandedRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 1");

    // Tiers
    const platinumRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'PLATINUM'");
    const goldRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'GOLD'");
    const silverRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'SILVER'");
    const bronzeRes = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE tier = 'BRONZE'");

    // 24h Stats (Expensive Full Scan Avoidance)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newStatsRes = await db.execute({
        sql: `SELECT 
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new24h,
            SUM(CASE WHEN total_doc_cnt >= 0 AND updated_at >= ? THEN 1 ELSE 0 END) as docs24h
        FROM keywords`,
        args: [since24h, since24h]
    });

    // Seed Stats
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
    console.log('   Saving to DB...');
    await db.execute({
        sql: "INSERT OR REPLACE INTO stats_cache (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        args: ['monitor_stats', JSON.stringify(stats)]
    });

    console.log('✅ Stats Updated Successfully!');
    console.log('   Content:', JSON.stringify(stats, null, 2));
}

updateStats().catch(console.error);
