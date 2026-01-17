import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkSeeds() {
    const db = getTursoClient();
    try {
        const r1 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 100');
        console.log('확장 대기 중 (is_expanded=0, 검색량>=100):', r1.rows[0].count);

        const r2 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2');
        console.log('확장 진행 중 고착 (is_expanded=2):', r2.rows[0].count);

        const r3 = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1 AND total_search_cnt >= 100');
        console.log('확장 완료 (is_expanded=1, 검색량>=100):', r3.rows[0].count);

        const r4 = await db.execute('SELECT keyword, total_search_cnt, is_expanded FROM keywords WHERE total_search_cnt >= 100 ORDER BY is_expanded ASC, total_search_cnt DESC LIMIT 10');
        console.log('\n확장 대상 후보 TOP 10:');
        r4.rows.forEach((row, i) => {
            console.log(`${i + 1}. ${row.keyword} (검색량: ${row.total_search_cnt}, 확장상태: ${row.is_expanded})`);
        });

        // Check the actual query used by runExpandTask
        const r5 = await db.execute(`
            SELECT COUNT(*) as count FROM keywords
            WHERE (is_expanded = 0)
               OR (is_expanded = 2)
               OR (is_expanded = 1 AND updated_at < datetime('now', '-7 days'))
        `);
        console.log('\n실제 배치 선택 조건에 맞는 시드 총 개수:', r5.rows[0].count);

    } catch (e) {
        console.error(e);
    }
}

checkSeeds();
