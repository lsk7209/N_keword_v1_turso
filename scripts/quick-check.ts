import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function quickCheck() {
    const db = getTursoClient();

    const r30m = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-30 minutes")');
    const r1h = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-1 hour")');
    const proc = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 2');
    const total = await db.execute('SELECT COUNT(*) as c FROM keywords');
    const seeds = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 50');

    console.log('LAST_30MIN:', r30m.rows[0].c);
    console.log('LAST_1HOUR:', r1h.rows[0].c);
    console.log('PROCESSING:', proc.rows[0].c);
    console.log('TOTAL:', total.rows[0].c);
    console.log('SEEDS_READY:', seeds.rows[0].c);
}

quickCheck();
