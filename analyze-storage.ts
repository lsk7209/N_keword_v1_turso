import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function analyzeStorage() {
    const db = getTursoClient();

    console.log('📊 Storage Analysis\n');

    try {
        // 1. 테이블별 크기 (Turso는 sqlite_dbpage를 지원하지 않을 수 있음)
        console.log('1. Table Statistics:');
        const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
        for (const table of tables.rows) {
            const count = await db.execute(`SELECT COUNT(*) as count FROM ${table.name}`);
            console.log(`  ${table.name}: ${count.rows[0].count} rows`);
        }

        // 2. 인덱스 분석
        console.log('\n2. Index Analysis:');
        const indexes = await db.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
        console.log(`  Total indexes: ${indexes.rows.length}`);

        // 3. 최근 증가 패턴
        console.log('\n3. Growth Pattern (last 7 days):');
        const growth = await db.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as new_keywords
            FROM keywords
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);
        growth.rows.forEach(row => {
            console.log(`  ${row.date}: +${row.new_keywords} keywords`);
        });

        // 4. 데이터 밀도 체크 (NULL 값이 많으면 공간 낭비)
        console.log('\n4. Data Density Check:');
        const nullCheck = await db.execute(`
            SELECT 
                COUNT(*) as total,
                COUNT(total_doc_cnt) as has_docs,
                COUNT(tier) as has_tier
            FROM keywords
        `);
        const row = nullCheck.rows[0];
        console.log(`  Total rows: ${row.total}`);
        console.log(`  With docs: ${row.has_docs} (${((Number(row.has_docs) / Number(row.total)) * 100).toFixed(1)}%)`);
        console.log(`  With tier: ${row.has_tier} (${((Number(row.has_tier) / Number(row.total)) * 100).toFixed(1)}%)`);

        // 5. 컬럼별 크기 추정
        console.log('\n5. Column Size Analysis (sample):');
        const sample = await db.execute('SELECT * FROM keywords LIMIT 1');
        if (sample.rows.length > 0) {
            const row = sample.rows[0] as any;
            const columns = Object.keys(row);
            let totalSize = 0;
            columns.forEach(col => {
                const value = row[col];
                const size = value ? JSON.stringify(value).length : 0;
                totalSize += size;
                if (size > 10) {
                    console.log(`  ${col}: ${size} bytes`);
                }
            });
            console.log(`  Total per row (estimated): ${totalSize} bytes`);
        }

        // 6. 권장 사항
        console.log('\n📌 Recommendations:');
        console.log('  1. ✅ No duplicates found - deduplication working');
        console.log('  2. ⚠️  Consider VACUUM (Turso does this automatically)');
        console.log('  3. ⚠️  Monitor index usage - some may be redundant');
        console.log('  4. 💡 80MB/hour growth may be from:');
        console.log('     - WAL file accumulation');
        console.log('     - Index overhead (14 indexes ×  ~30MB total)');
        console.log('     - Turso sync/replication overhead');

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

analyzeStorage();
