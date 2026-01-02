
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { bulkDeferredInsert } from '../src/utils/mining-engine';
import { getTursoClient } from '../src/utils/turso';
import { Keyword } from '../src/utils/mining-engine';

async function testInsert() {
    const db = getTursoClient();
    const testKeyword = `test_kw_${Date.now()}`;

    console.log(`🧪 Testing insertion of new keyword: ${testKeyword}`);

    const mockKeyword: Keyword = {
        keyword: testKeyword,
        total_search_cnt: 100,
        pc_search_cnt: 50,
        mo_search_cnt: 50,
        total_doc_cnt: 0,
        blog_doc_cnt: 0,
        cafe_doc_cnt: 0,
        web_doc_cnt: 0,
        news_doc_cnt: 0,
        is_expanded: false,
        // others optional
    };

    const result = await bulkDeferredInsert([mockKeyword]);
    console.log('📝 Upsert Result:', result);

    const check = await db.execute({
        sql: "SELECT * FROM keywords WHERE keyword = ?",
        args: [testKeyword]
    });

    if (check.rows.length > 0) {
        console.log('✅ SUCCESS: Keyword found in DB!', check.rows[0]);
    } else {
        console.error('❌ FAILURE: Keyword NOT found in DB!');
    }
}

testInsert();
