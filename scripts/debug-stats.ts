import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- Database Status Check ---');
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
        return;
    }

    const client = createClient({ url, authToken });

    try {
        const total = await client.execute('SELECT COUNT(*) as c FROM keywords');
        const docsFilled = await client.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL');
        const docsPending = await client.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NULL');
        
        const last24hDocs = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime('now', '-24 hours')");
        const last1hDocs = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime('now', '-1 hour')");
        const last10mDocs = await client.execute("SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime('now', '-10 minutes')");

        console.log('Total Keywords:', total.rows[0].c);
        console.log('Docs Filled:', docsFilled.rows[0].c);
        console.log('Docs Pending:', docsPending.rows[0].c);
        console.log('--- Speed ---');
        console.log('Last 24h Docs:', last24hDocs.rows[0].c);
        console.log('Last 1h Docs:', last1hDocs.rows[0].c);
        console.log('Last 10m Docs:', last10mDocs.rows[0].c);
        
        const estDaily = (Number(last1hDocs.rows[0].c) * 24);
        console.log('Estimated Daily Speed (based on last hour):', estDaily);

    } catch (err) {
        console.error('Error querying DB:', err);
    } finally {
        // client.close() might be needed for some versions of libsql client
    }
}

main();
