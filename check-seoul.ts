import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();

    // "SEOUL" 키워드 확인 (로그에 나온 것)
    const seoul = await db.execute({
        sql: 'SELECT keyword, total_doc_cnt, updated_at FROM keywords WHERE keyword = ?',
        args: ['SEOUL']
    });

    console.log('SEOUL 키워드:');
    console.log(seoul.rows[0] || '없음');

    // 최근 업데이트 5개
    const latest = await db.execute(`
        SELECT keyword, total_doc_cnt, updated_at 
        FROM keywords 
        ORDER BY updated_at DESC 
        LIMIT 5
    `);

    console.log('\n최근 업데이트된 키워드 5개:');
    latest.rows.forEach((r: any) => {
        console.log(`  ${r.keyword}: ${r.total_doc_cnt} (${r.updated_at})`);
    });
}

check();
