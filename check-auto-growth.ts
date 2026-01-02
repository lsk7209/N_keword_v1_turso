import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkAutoCollection() {
    const db = getTursoClient();

    console.log('=== 자가증식 상태 확인 ===\n');

    // 1. 최근 30분 내 활동
    const recent30m = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE created_at > datetime('now', '-30 minutes')
    `);
    console.log('✅ 최근 30분 내 신규: ' + recent30m.rows[0].count + '개');

    // 2. 최근 1시간 내 활동
    const recent1h = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE created_at > datetime('now', '-1 hour')
    `);
    console.log('✅ 최근 1시간 내 신규: ' + recent1h.rows[0].count + '개');

    // 3. 현재 확장 중인 키워드 (is_expanded = 2)
    const processing = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE is_expanded = 2
    `);
    console.log('🔄 현재 확장 진행중: ' + processing.rows[0].count + '개');

    // 4. 최근 5분 내 업데이트된 키워드
    const recentUpdated = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE updated_at > datetime('now', '-5 minutes')
    `);
    console.log('🔄 최근 5분 내 업데이트: ' + recentUpdated.rows[0].count + '개');

    // 5. 가장 최근 생성된 키워드 5개
    const latestKeywords = await db.execute(`
        SELECT keyword, created_at, total_search_cnt
        FROM keywords 
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    console.log('\n📋 가장 최근 키워드:');
    latestKeywords.rows.forEach((r, i) => {
        const timeAgo = new Date(r.created_at as string).toLocaleString('ko-KR');
        console.log(`  ${i + 1}. ${r.keyword} (${r.total_search_cnt}) - ${timeAgo}`);
    });

    // 6. 시드 대기 상태
    const seeds = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE is_expanded = 0 AND total_search_cnt >= 50
    `);
    console.log('\n⏳ 확장 대기 중인 시드 (vol>=50): ' + seeds.rows[0].count + '개');

    // 7. 총 키워드 수
    const total = await db.execute('SELECT COUNT(*) as count FROM keywords');
    console.log('📊 총 키워드: ' + total.rows[0].count + '개');
}

checkAutoCollection();
