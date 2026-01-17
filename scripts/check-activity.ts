import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();

    // 최근 10분 내 추가된 키워드
    const recent = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE created_at > datetime('now', '-10 minutes')
    `);
    console.log('ADDED_LAST_10MIN:', recent.rows[0].count);

    // 최근 10분 내 업데이트된 키워드
    const updated = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE updated_at > datetime('now', '-10 minutes')
    `);
    console.log('UPDATED_LAST_10MIN:', updated.rows[0].count);

    // "인형" 관련 키워드 중 최근 추가된 것들
    const dollKeywords = await db.execute(`
        SELECT keyword, created_at 
        FROM keywords 
        WHERE keyword LIKE '%인형%' 
        AND created_at > datetime('now', '-10 minutes')
        ORDER BY created_at DESC 
        LIMIT 10
    `);
    console.log('RECENT_DOLL_KEYWORDS:', dollKeywords.rows.length);
    dollKeywords.rows.forEach(r => console.log('  -', r.keyword));

    // 자동 수집 가능한 시드 개수 (검색량 50 이상, 확장 안됨)
    const seedsReady = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE is_expanded = 0 
        AND total_search_cnt >= 50
    `);
    console.log('SEEDS_READY_VOL50+:', seedsReady.rows[0].count);
}

check();
