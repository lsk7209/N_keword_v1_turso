import { getTursoClient, getCurrentTimestamp } from './src/utils/turso';
import { fetchDocumentCount } from './src/utils/naver-api';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function manualFillOne() {
    const db = getTursoClient();
    const keyword = '번역기';

    console.log(`Manually filling docs for '${keyword}'...`);

    try {
        const counts = await fetchDocumentCount(keyword);
        console.log('API Result:', counts);

        if (counts.total !== null) {
            const res = await db.execute({
                sql: `UPDATE keywords SET 
                        total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?, 
                        web_doc_cnt = ?, news_doc_cnt = ?, updated_at = ? 
                      WHERE keyword = ?`,
                args: [
                    counts.total, counts.blog, counts.cafe,
                    counts.web, counts.news, getCurrentTimestamp(), keyword
                ]
            });
            console.log(`DB Update Success: ${res.rowsAffected} rows affected.`);
        } else {
            console.log('API returned NULL for count.');
        }
    } catch (e: any) {
        console.error('Manual fill failed:', e);
    }
}

manualFillOne();
