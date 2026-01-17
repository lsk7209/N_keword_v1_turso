import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();

    // 최근 10분 문서 수 수집
    const recent10 = await db.execute(`
        SELECT COUNT(*) as c FROM keywords 
        WHERE total_doc_cnt IS NOT NULL 
        AND total_doc_cnt > 0
        AND updated_at > datetime('now', '-10 minutes')
    `);

    // 최근 30분
    const recent30 = await db.execute(`
        SELECT COUNT(*) as c FROM keywords 
        WHERE total_doc_cnt IS NOT NULL 
        AND total_doc_cnt > 0
        AND updated_at > datetime('now', '-30 minutes')
    `);

    // 대기 중
    const pending = await db.execute(`
        SELECT COUNT(*) as c FROM keywords 
        WHERE total_doc_cnt IS NULL
    `);

    console.log('DOCS_UPDATED_10MIN:', recent10.rows[0].c);
    console.log('DOCS_UPDATED_30MIN:', recent30.rows[0].c);
    console.log('DOCS_PENDING:', pending.rows[0].c);

    // 최근 수집된 키워드 샘플
    const samples = await db.execute(`
        SELECT keyword, total_doc_cnt, updated_at 
        FROM keywords 
        WHERE total_doc_cnt IS NOT NULL 
        AND updated_at > datetime('now', '-10 minutes')
        ORDER BY updated_at DESC 
        LIMIT 5
    `);

    console.log('\n최근 수집된 샘플:');
    samples.rows.forEach((r: any) => {
        console.log(`  ${r.keyword}: ${r.total_doc_cnt} (${r.updated_at})`);
    });
}

check();
