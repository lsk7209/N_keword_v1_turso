import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkQueue() {
    const db = getTursoClient();

    console.log('Checking next 20 items in FillDocs Queue...');

    // Same query as batch-runner
    const res = await db.execute({
        sql: `SELECT id, keyword, total_doc_cnt, total_search_cnt 
              FROM keywords
              WHERE (total_doc_cnt IS NULL)
                 OR (total_doc_cnt = -2 AND updated_at < datetime('now', '-2 hours'))
              ORDER BY total_search_cnt DESC
              LIMIT 20`,
        args: []
    });

    if (res.rows.length === 0) {
        console.log('Queue is EMPTY!');
    } else {
        res.rows.forEach(r => {
            console.log(`[${r.keyword}] Search: ${r.total_search_cnt}, Doc: ${r.total_doc_cnt}`);
        });
    }
}

checkQueue();
