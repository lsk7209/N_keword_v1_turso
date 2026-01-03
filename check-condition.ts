import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkCondition() {
    const db = getTursoClient();
    const keyword = '대한항공';

    console.log(`Checking condition for: ${keyword}`);

    const res = await db.execute({
        sql: `SELECT id, total_doc_cnt, updated_at, 
              (total_doc_cnt IS NULL) as is_null,
              (total_doc_cnt = -2) as is_processing
              FROM keywords WHERE keyword = ?`,
        args: [keyword]
    });

    const row = res.rows[0];
    console.log('Row:', row);

    if (!row) {
        console.log('Row not found!');
        return;
    }

    if (row.is_null) {
        console.log('MATCH: total_doc_cnt IS NULL');
    } else if (row.is_processing) {
        console.log('MATCH: total_doc_cnt IS -2');
    } else {
        console.log('NO MATCH: It has a value and is not processing.');
    }
}

checkCondition();
