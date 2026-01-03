import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkNewBatch() {
    const db = getTursoClient();
    const targets = ['번역기', '번역', '연말정산기간', '해돋이명소', '청주공항'];

    console.log(`Checking status of new batch items: ${targets.join(', ')}`);

    const placeholders = targets.map(() => '?').join(',');
    const result = await db.execute({
        sql: `SELECT keyword, total_doc_cnt, updated_at FROM keywords WHERE keyword IN (${placeholders})`,
        args: targets
    });

    console.log('Current Time (UTC):', new Date().toISOString());
    result.rows.forEach(r => {
        console.log(`[${r.keyword}] Docs: ${r.total_doc_cnt}, Updated: ${r.updated_at}`);
    });
}

checkNewBatch();
