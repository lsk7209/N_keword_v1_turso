
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function diagnose() {
    const db = getTursoClient();
    console.log('🔍 Diagnosing Collection Status...');

    try {
        // 1. 상태별 카운트
        const r1 = await db.execute(`
            SELECT 
                SUM(CASE WHEN is_expanded = 0 THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as done,
                SUM(CASE WHEN is_expanded = 2 THEN 1 ELSE 0 END) as processing,
                COUNT(*) as total
            FROM keywords
        `);
        console.log('📊 Keyword Stats:', r1.rows[0]);

        // 2. 최근 활동 내역 (최근 1시간 내 업데이트 수)
        const r2 = await db.execute(`
            SELECT COUNT(*) as recent_updates 
            FROM keywords 
            WHERE updated_at > datetime('now', '-1 hour')
        `);
        console.log('⏱️ Updated in last 1 hour:', r2.rows[0].recent_updates);

        // 3. 최근 5분 내 업데이트
        const r3 = await db.execute(`
            SELECT COUNT(*) as very_recent_updates 
            FROM keywords 
            WHERE updated_at > datetime('now', '-5 minutes')
        `);
        console.log('⚡ Updated in last 5 minutes:', r3.rows[0].very_recent_updates);

        // 4. Stuck Check (작업 중인데 10분 이상 경과한 것)
        const r4 = await db.execute(`
            SELECT COUNT(*) as stuck
            FROM keywords
            WHERE is_expanded = 2 
            AND updated_at < datetime('now', '-10 minutes')
        `);
        console.log('⚠️ Stuck (Processing > 10m):', r4.rows[0].stuck);

    } catch (e) {
        console.error('❌ Diagnostic Error:', e);
    }
}

diagnose();
