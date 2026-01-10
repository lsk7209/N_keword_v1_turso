
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    const client = createClient({ url, authToken });

    const keywords = ['유튜브', '환율', '삼성전자주가', '로또', '날씨', '맞춤법검사기'];

    try {
        console.log('--- Keywords Status Check ---');
        for (const kw of keywords) {
            const res = await client.execute({
                sql: "SELECT id, keyword, total_search_cnt, total_doc_cnt, tier, golden_ratio, is_expanded FROM keywords WHERE keyword = ?",
                args: [kw]
            });
            if (res.rows.length > 0) {
                const r = res.rows[0];
                console.log(`Keyword: ${r.keyword}`);
                console.log(`  Volume: ${r.total_search_cnt}`);
                console.log(`  DocCnt: ${r.total_doc_cnt} (${typeof r.total_doc_cnt})`);
                console.log(`  Tier: ${r.tier}`);
                console.log(`  Ratio: ${r.golden_ratio}`);
                console.log(`  Expanded: ${r.is_expanded}`);
            } else {
                console.log(`Keyword: ${kw} - NOT FOUND`);
            }
        }

        // Check if there are any keywords with total_doc_cnt IS NULL
        const nullRes = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NULL");
        console.log(`\nKeywords with NULL doc_cnt: ${nullRes.rows[0].c}`);

        // Check if there are any keywords with total_doc_cnt = 0
        const zeroRes = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt = 0");
        console.log(`Keywords with 0 doc_cnt: ${zeroRes.rows[0].c}`);

        // Check if there are any keywords with total_doc_cnt = -2 (Processing)
        const procRes = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt = -2");
        console.log(`Keywords with -2 (Processing) doc_cnt: ${procRes.rows[0].c}`);

    } catch (e) {
        console.error(e);
    } finally {
        client.close();
    }
}

check();
