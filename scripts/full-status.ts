
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function fullStatus() {
    const db = getTursoClient();

    // 1. 총 키워드 수
    const total = await db.execute("SELECT COUNT(*) as c FROM keywords");

    // 2. 상태별
    const waiting = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 0");
    const done = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 1");
    const processing = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 2");

    // 3. 최근 활동
    const recent5m = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE updated_at > datetime('now', '-5 minutes')");
    const recent1h = await db.execute("SELECT COUNT(*) as c FROM keywords WHERE updated_at > datetime('now', '-1 hour')");

    console.log('='.repeat(50));
    console.log('📊 SYSTEM STATUS REPORT');
    console.log('='.repeat(50));
    console.log(`총 키워드: ${total.rows[0].c}`);
    console.log(`대기(waiting): ${waiting.rows[0].c}`);
    console.log(`완료(done): ${done.rows[0].c}`);
    console.log(`처리중(processing): ${processing.rows[0].c}`);
    console.log('-'.repeat(50));
    console.log(`최근 5분 업데이트: ${recent5m.rows[0].c}`);
    console.log(`최근 1시간 업데이트: ${recent1h.rows[0].c}`);
    console.log('='.repeat(50));

    if (Number(recent5m.rows[0].c) > 0) {
        console.log('✅ 수집 활성화 됨!');
    } else if (Number(waiting.rows[0].c) > 0) {
        console.log('⏳ 시드 있음. 곧 수집 시작 예정.');
    } else {
        console.log('⚠️ 시드 없음. 확장 필요.');
    }
}
fullStatus();
