
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function debug() {
    const db = getTursoClient();

    // 1. is_expanded 값 분포 (어떤 값들이 있는지)
    const dist = await db.execute(`
        SELECT is_expanded, COUNT(*) as cnt 
        FROM keywords 
        GROUP BY is_expanded
    `);
    console.log('📊 is_expanded 분포:');
    dist.rows.forEach(r => console.log(`  ${r.is_expanded}: ${r.cnt}개`));

    // 2. is_expanded = 0 인 것 샘플
    const sample = await db.execute(`
        SELECT id, keyword, is_expanded, typeof(is_expanded) as type
        FROM keywords 
        WHERE is_expanded = 0 
        LIMIT 5
    `);
    console.log('\n📋 is_expanded=0 샘플:', sample.rows.length, '개');
    sample.rows.forEach(r => console.log(`  ${r.keyword} (type: ${r.type})`));

    // 3. Zero-Read 쿼리 시뮬레이션
    const claim = await db.execute(`
        SELECT id FROM keywords
        WHERE (is_expanded = 0)
           OR (is_expanded = 2 AND updated_at < datetime('now', '-2 hours'))
        ORDER BY total_search_cnt DESC
        LIMIT 10
    `);
    console.log('\n🎯 Zero-Read SELECT 결과:', claim.rows.length, '개');
}
debug();
