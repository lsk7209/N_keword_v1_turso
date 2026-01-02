
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

// Simple timestamp helper
function getCurrentTimestamp() {
    return new Date().toISOString();
}

async function resetDb() {
    const db = getTursoClient();
    console.log('🔥 RESETTING DATABASE...');

    // 1. DELETE ALL
    await db.execute("DELETE FROM keywords");
    // VACUUM to reclaim space? Optional but good for clean start
    // await db.execute("VACUUM"); 
    console.log('✅ All data deleted.');

    // 2. Insert Seeds
    // 초기 시드: 다양한 카테고리 (IT, 금융, 라이프스타일, 쇼핑, 로컬)
    const seeds = [
        '아이폰', '갤럭시', '에어팟',
        '유튜브', '넷플릭스', '인스타그램',
        '비트코인', '이더리움', '주식', '환율',
        '부동산', '아파트', '청약',
        '여행', '제주도여행', '일본여행', '해외여행',
        '맛집', '강남맛집', '홍대맛집',
        '다이어트', '운동', '헬스', '요가',
        '패션', '나이키', '아디다스',
        '게임', '리그오브레전드', '롤',
        'AI', 'chatgpt', '인공지능',
        '사랑', '이별', '심리테스트'
    ];

    const timestamp = new Date().toISOString(); // Simple ISO string

    const statements = seeds.map(keyword => ({
        sql: `INSERT INTO keywords (
                keyword, total_search_cnt, 
                is_expanded, created_at, updated_at
              ) VALUES (?, 0, 0, ?, ?)`,
        args: [keyword, timestamp, timestamp]
    }));

    await db.batch(statements);
    console.log(`🌱 Inserted ${seeds.length} initial seeds.`);
    console.log('✅ DB Reset Complete. Ready for Mining.');
}

resetDb();
