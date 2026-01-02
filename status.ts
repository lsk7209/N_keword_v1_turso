import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();

    // 키워드 수집
    const k5 = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-5 minutes")');
    const k15 = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-15 minutes")');

    // 문서 수 수집
    const d5 = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime("now", "-5 minutes")');
    const d15 = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime("now", "-15 minutes")');

    // 대기
    const pending = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NULL');

    console.log('KEYWORD_5MIN:', k5.rows[0].c);
    console.log('KEYWORD_15MIN:', k15.rows[0].c);
    console.log('DOCS_5MIN:', d5.rows[0].c);
    console.log('DOCS_15MIN:', d15.rows[0].c);
    console.log('DOCS_PENDING:', pending.rows[0].c);
    console.log('');
    console.log('KEYWORD_STATUS:', (k5.rows[0].c as number) > 0 ? 'OK' : 'STOPPED');
    console.log('DOCS_STATUS:', (d5.rows[0].c as number) > 0 ? 'OK' : 'STOPPED');
}

check();
