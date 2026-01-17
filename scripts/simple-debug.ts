
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '@/utils/turso';

async function debug() {
    const db = getTursoClient();

    const dist = await db.execute(`SELECT is_expanded, COUNT(*) as cnt FROM keywords GROUP BY is_expanded`);
    console.log(JSON.stringify(dist.rows));

    const claim = await db.execute(`SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 0`);
    console.log('is_expanded=0:', claim.rows[0].c);
}
debug();
