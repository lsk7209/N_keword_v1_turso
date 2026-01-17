import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function optimizeIndexes() {
    const db = getTursoClient();

    console.log('🔧 Starting index optimization...\n');

    try {
        // 현재 인덱스 목록
        const indexes = await db.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='keywords' AND sql IS NOT NULL");
        console.log(`현재 인덱스: ${indexes.rows.length}개\n`);

        // 사용 빈도가 낮은 인덱스 제거 대상
        const indexesToDrop = [
            'idx_ctr_desc',           // CTR 정렬은 자주 사용 안 함
            'idx_pc_ctr_desc',        // PC CTR 정렬도 거의 안 씀
            'idx_mo_ctr_desc',        // MO CTR 정렬도 거의 안 씀
            'idx_cafe_opp',           // 카페 문서수 정렬 거의 안 씀
            'idx_blog_opp',           // 블로그 문서수 정렬 거의 안 씀  
            'idx_web_opp',            // 웹 문서수 정렬 거의 안 씀
            'idx_created_at_range'    // created_at은 이미 최근 키워드 조회에 포함됨
        ];

        for (const indexName of indexesToDrop) {
            try {
                await db.execute(`DROP INDEX IF EXISTS ${indexName}`);
                console.log(`✅ Dropped: ${indexName}`);
            } catch (e: any) {
                console.log(`⚠️  Failed to drop ${indexName}:`, e.message);
            }
        }

        // 남은 인덱스 확인
        const remainingIndexes = await db.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='keywords' AND sql IS NOT NULL");
        console.log(`\n✅ Optimization complete!`);
        console.log(`남은 인덱스: ${remainingIndexes.rows.length}개`);
        console.log('Core indexes kept:');
        remainingIndexes.rows.forEach(row => {
            console.log(`  - ${row.name}`);
        });

        console.log('\n💡 Estimated space savings: 15-25 MB');
        console.log('⚠️  Note: Turso may need time to reclaim space (VACUUM happens automatically)');

    } catch (e) {
        console.error('Error:', e);
    }
}

optimizeIndexes();
