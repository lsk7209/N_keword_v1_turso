import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function diagnoseStorage() {
    const db = getTursoClient();
    try {
        // 1. 최근 1시간 생성된 키워드 수
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const r1 = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM keywords WHERE created_at >= ?',
            args: [oneHourAgo]
        });
        console.log('최근 1시간 생성 키워드:', r1.rows[0].count);

        // 2. 전체 키워드 수
        const r2 = await db.execute('SELECT COUNT(*) as count FROM keywords');
        console.log('전체 키워드:', r2.rows[0].count);

        // 3. 중복 키워드 확인
        const r3 = await db.execute(`
            SELECT keyword, COUNT(*) as dup_count 
            FROM keywords 
            GROUP BY keyword 
            HAVING COUNT(*) > 1 
            LIMIT 10
        `);
        console.log('\n중복 키워드 샘플 (있다면):');
        if (r3.rows.length === 0) {
            console.log('  ✅ 중복 없음');
        } else {
            r3.rows.forEach(row => {
                console.log(`  ⚠️ "${row.keyword}" - ${row.dup_count}번 중복`);
            });
        }

        // 4. 총 중복 키워드 수
        const r4 = await db.execute(`
            SELECT COUNT(*) as dup_keywords
            FROM (
                SELECT keyword 
                FROM keywords 
                GROUP BY keyword 
                HAVING COUNT(*) > 1
            )
        `);
        console.log('\n중복된 키워드 종류 수:', r4.rows[0].dup_keywords);

        // 5. 키워드 당 평균 크기 추정
        const r5 = await db.execute('SELECT * FROM keywords LIMIT 1');
        if (r5.rows.length > 0) {
            const sampleSize = JSON.stringify(r5.rows[0]).length;
            console.log('\n키워드 1개 예상 크기:', sampleSize, 'bytes');
            const totalRows = Number(r2.rows[0].count);
            const estimatedSize = (sampleSize * totalRows) / (1024 * 1024);
            console.log('예상 총 크기:', estimatedSize.toFixed(2), 'MB');
        }

        // 6. 최근 벌크 삽입 체크 (updated_at 기준)
        const r6 = await db.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM keywords
            WHERE created_at >= datetime('now', '-24 hours')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);
        console.log('\n최근 24시간 일별 생성:');
        r6.rows.forEach(row => {
            console.log(`  ${row.date}: ${row.count}개`);
        });

    } catch (e) {
        console.error('Error:', e);
    }
}

diagnoseStorage();
