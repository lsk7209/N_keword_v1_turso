
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function testClaim() {
    const db = getTursoClient();
    console.log('🧪 Testing UPDATE...RETURNING on real keywords table...');

    try {
        // 실제 Zero-Read 쿼리 실행 (batch-runner.ts와 동일)
        const result = await db.execute({
            sql: `UPDATE keywords 
                  SET is_expanded = 2, updated_at = ?
                  WHERE id IN (
                      SELECT id FROM keywords
                      WHERE (is_expanded = 0)
                         OR (is_expanded = 2 AND updated_at < datetime('now', '-2 hours'))
                      ORDER BY total_search_cnt DESC
                      LIMIT ?
                  )
                  RETURNING id, keyword, total_search_cnt`,
            args: [new Date().toISOString(), 5]
        });

        console.log(`✅ Returned ${result.rows.length} rows`);
        if (result.rows.length > 0) {
            console.log('Sample:', result.rows[0]);
        }

        // 롤백 (테스트니까)
        if (result.rows.length > 0) {
            const ids = result.rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            await db.execute({
                sql: `UPDATE keywords SET is_expanded = 0 WHERE id IN (${placeholders})`,
                args: ids
            });
            console.log('🔄 Rolled back test changes');
        }
    } catch (e: any) {
        console.error('❌ Query Error:', e.message);
    }
}
testClaim();
