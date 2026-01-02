import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function diagnose() {
    const db = getTursoClient();

    // 1. Mining mode 확인
    const modeResult = await db.execute('SELECT value FROM settings WHERE key = "mining_mode"');
    console.log('MINING_MODE:', modeResult.rows[0]?.value || 'not set');

    // 2. 시드 선택 조건 확인
    const seedsAvailable = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE is_expanded IN (0, 1, 2) 
        AND total_search_cnt >= 100
    `);
    console.log('SEEDS_AVAILABLE (vol>=100):', seedsAvailable.rows[0].count);

    // 3. 처리 중인 키워드 확인
    const processing = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2');
    console.log('PROCESSING (is_expanded=2):', processing.rows[0].count);

    // 4. 최근 생성/업데이트 확인
    const recentCreated = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE created_at > datetime('now', '-24 hours')
    `);
    console.log('CREATED_24H:', recentCreated.rows[0].count);

    const recentUpdated = await db.execute(`
        SELECT COUNT(*) as count 
        FROM keywords 
        WHERE updated_at > datetime('now', '-24 hours')
    `);
    console.log('UPDATED_24H:', recentUpdated.rows[0].count);

    // 5. 가장 최근 활동 시간
    const lastActivity = await db.execute(`
        SELECT MAX(updated_at) as last_update
        FROM keywords
    `);
    console.log('LAST_ACTIVITY:', lastActivity.rows[0].last_update);
}

diagnose();
