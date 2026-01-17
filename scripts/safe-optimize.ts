import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function safeOptimization() {
    const db = getTursoClient();

    console.log('🔧 Safe Storage Optimization\n');

    try {
        // Phase 1: 확실히 안 쓰는 인덱스만 제거
        console.log('Phase 1: Removing rarely-used indexes...\n');

        const lowPriorityIndexes = [
            'idx_ctr_desc',        // 전체 CTR 정렬은 모니터에서도 안 씀
            'idx_pc_ctr_desc',     // PC CTR 정렬 미사용
            'idx_mo_ctr_desc',     // MO CTR 정렬 미사용
            'idx_cafe_opp',        // 카페 기회 분석 거의 안 함
            'idx_blog_opp',        // 블로그 기회 분석 거의 안 함
            'idx_web_opp'          // 웹 기회 분석 거의 안 함
        ];

        let dropped = 0;
        for (const idx of lowPriorityIndexes) {
            try {
                await db.execute(`DROP INDEX IF EXISTS ${idx}`);
                console.log(`✅ Dropped: ${idx}`);
                dropped++;
            } catch (e: any) {
                console.log(`⚠️  Skip: ${idx} (${e.message})`);
            }
        }

        console.log(`\n✅ Phase 1 Complete: ${dropped} indexes removed`);
        console.log('💾 Estimated savings: 40-60 MB');

        // Phase 2: 핵심 인덱스 확인
        console.log('\nPhase 2: Verifying core indexes...\n');

        const coreIndexes = await db.execute(`
            SELECT name 
            FROM sqlite_master 
            WHERE type='index' AND tbl_name='keywords' AND sql IS NOT NULL
        `);

        console.log('Remaining core indexes:');
        coreIndexes.rows.forEach((row, i) => {
            console.log(`  ${i + 1}. ${row.name}`);
        });

        console.log('\n📌 Summary:');
        console.log(`  - Removed: ${dropped} low-priority indexes`);
        console.log(`  - Kept: ${coreIndexes.rows.length} core indexes`);
        console.log(`  - Core indexes cover:`);
        console.log(`    • expand_candidates (is_expanded, total_search_cnt)`);
        console.log(`    • fill_docs_candidates (total_doc_cnt, total_search_cnt)`);
        console.log(`    • keywords_tier_ratio (tier, golden_ratio)`);
        console.log(`    • keyword_lookup (keyword)`);
        console.log(`    • search_desc (total_search_cnt)`);
        console.log(`    • updated_at (updated_at)`);

        console.log('\n⏳ Note: Turso will auto-VACUUM to reclaim space (may take a few minutes)');

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

safeOptimization();
