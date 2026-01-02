
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function testZeroRead() {
    const db = getTursoClient();
    console.log('🧪 Testing UPDATE...RETURNING capability...');

    try {
        // 1. Setup Test Table
        await db.execute("DROP TABLE IF EXISTS test_claims");
        await db.execute(`
            CREATE TABLE test_claims (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT,
                status INTEGER DEFAULT 0
            )
        `);

        // 2. Insert Dummy Data
        await db.batch([
            "INSERT INTO test_claims (keyword, status) VALUES ('kw1', 0)",
            "INSERT INTO test_claims (keyword, status) VALUES ('kw2', 0)",
            "INSERT INTO test_claims (keyword, status) VALUES ('kw3', 1)",
            "INSERT INTO test_claims (keyword, status) VALUES ('kw4', 0)",
        ]);
        console.log('✅ Dummy data inserted');

        // 3. Test Query: Subquery with LIMIT
        // 아까 실패했던 패턴과 유사하게 구성
        const sql = `
            UPDATE test_claims
            SET status = 2
            WHERE id IN (
                SELECT id FROM test_claims
                WHERE status = 0
                LIMIT 2
            )
            RETURNING id, keyword, status
        `;

        console.log('🚀 Executing UPDATE...RETURNING with Subquery LIMIT...');
        const result = await db.execute(sql);

        console.log('📊 Result Rows:', result.rows);

        if (result.rows.length === 2) {
            console.log('🎉 SUCCESS: Zero-Read Claim works!');
            // 결과가 kw1, kw2 또는 kw1, kw4 여야 함
        } else {
            console.error(`❌ FAILURE: Expected 2 rows, got ${result.rows.length}`);
        }

        // Cleanup
        await db.execute("DROP TABLE IF EXISTS test_claims");

    } catch (e) {
        console.error('❌ Error during test:', e);
    }
}

testZeroRead();
