// 생성된 인덱스 확인 스크립트
const { createClient } = require('@libsql/client');

const TURSO_DATABASE_URL = "libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io";
const TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjYwMTM1NjIsImlkIjoiOTdmODdhYTQtY2E1MS00NWNhLWJhZWItYzBhMjQ3Y2JhZWM5IiwicmlkIjoiYzllZWNhMWMtMmM3MS00ZjA2LTk4M2QtYzBkYTM2NmM2ZjcxIn0.8odlDbEiAl-Cq61vRNOrey6jjuHfQmAO1A57laXz_tNxzmRc79D5d7Pa6r4brtjam8gTrxDjEmpyTL36gOIOCQ";

const client = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN,
});

async function verifyIndexes() {
    console.log('🔍 생성된 인덱스 확인 중...\n');

    try {
        // 테이블 확인
        const tables = await client.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN ('keywords', 'settings')
            ORDER BY name
        `);
        
        console.log('✅ 생성된 테이블:');
        tables.rows.forEach(row => {
            console.log(`   - ${row.name}`);
        });

        // 인덱스 확인
        const indexes = await client.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='index' AND tbl_name='keywords'
            ORDER BY name
        `);

        console.log(`\n✅ 생성된 인덱스 (총 ${indexes.rows.length}개):`);
        indexes.rows.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.name}`);
        });

        // 필수 인덱스 확인
        const requiredIndexes = [
            'idx_keyword_lookup',
            'idx_expand_candidates',
            'idx_fill_docs_candidates',
            'idx_has_docs',
            'idx_created_at_range'
        ];

        const existingIndexes = indexes.rows.map(r => r.name);
        const missingIndexes = requiredIndexes.filter(idx => !existingIndexes.includes(idx));

        if (missingIndexes.length === 0) {
            console.log('\n🎉 모든 필수 인덱스가 생성되었습니다!');
        } else {
            console.log('\n⚠️  누락된 인덱스:');
            missingIndexes.forEach(idx => console.log(`   - ${idx}`));
        }

        // 데이터 통계
        const stats = await client.execute('SELECT COUNT(*) as count FROM keywords');
        const keywordCount = stats.rows[0]?.count || 0;
        console.log(`\n📊 현재 키워드 수: ${keywordCount.toLocaleString()}개`);

    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        client.close();
    }
}

verifyIndexes();

