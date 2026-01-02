import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getTursoClient } from '../src/utils/turso';

async function checkStatus() {
    const db = getTursoClient();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Keyword Collection Status Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. 전체 통계
    const stats = await db.execute(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN is_expanded = 0 THEN 1 ELSE 0 END) as unexpanded,
            SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as expanded,
            SUM(CASE WHEN is_expanded = 2 THEN 1 ELSE 0 END) as processing,
            SUM(CASE WHEN total_doc_cnt IS NULL THEN 1 ELSE 0 END) as need_docs,
            SUM(CASE WHEN total_doc_cnt = -2 THEN 1 ELSE 0 END) as docs_processing
        FROM keywords
    `);

    const row = stats.rows[0];
    console.log('📊 Overall Statistics:');
    console.log(`  Total Keywords: ${Number(row.total).toLocaleString()}`);
    console.log(`  Unexpanded (is_expanded=0): ${Number(row.unexpanded).toLocaleString()}`);
    console.log(`  Expanded (is_expanded=1): ${Number(row.expanded).toLocaleString()}`);
    console.log(`  Processing (is_expanded=2): ${Number(row.processing).toLocaleString()}`);
    console.log(`  Need Docs (total_doc_cnt IS NULL): ${Number(row.need_docs).toLocaleString()}`);
    console.log(`  Docs Processing (total_doc_cnt=-2): ${Number(row.docs_processing).toLocaleString()}\n`);

    // 2. 최근 활동
    const recent = await db.execute(`
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
        FROM keywords
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 7
    `);

    console.log('📅 Recent Activity (Last 7 Days):');
    if (recent.rows.length > 0) {
        recent.rows.forEach(r => {
            console.log(`  ${r.date}: ${Number(r.count).toLocaleString()} keywords`);
        });
    } else {
        console.log('  ⚠️  No recent activity!');
    }
    console.log();

    // 3. 확장 가능한 시드 샘플
    const availableSeeds = await db.execute(`
        SELECT keyword, total_search_cnt, is_expanded, updated_at
        FROM keywords
        WHERE (is_expanded = 0)
           OR (is_expanded = 2 AND updated_at < datetime('now', '-2 hours'))
        ORDER BY total_search_cnt DESC
        LIMIT 10
    `);

    console.log('🌱 Available Seeds for Expansion (Top 10):');
    if (availableSeeds.rows.length > 0) {
        availableSeeds.rows.forEach((r, i) => {
            console.log(`  ${i + 1}. "${r.keyword}" (volume: ${r.total_search_cnt}, status: ${r.is_expanded})`);
        });
    } else {
        console.log('  ⚠️  NO SEEDS AVAILABLE! All keywords are already expanded.');
        console.log('  💡 Solution: Add new seed keywords manually or wait for re-expansion cycle.');
    }
    console.log();

    // 4. 고착된 processing 상태 확인
    const stuck = await db.execute(`
        SELECT COUNT(*) as count
        FROM keywords
        WHERE is_expanded = 2 AND updated_at < datetime('now', '-2 hours')
    `);

    const stuckCount = Number(stuck.rows[0].count);
    if (stuckCount > 0) {
        console.log(`⚠️  Stuck Processing: ${stuckCount.toLocaleString()} keywords stuck in processing state`);
        console.log('  These will be retried automatically.\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkStatus().catch(console.error);
