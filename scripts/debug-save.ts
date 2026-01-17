
import { manualMining } from '@/app/actions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    const seed = 'TEST_' + Date.now();
    const res = await manualMining([seed]);
    // @ts-ignore
    const inserted = res.results?.[0]?.stats?.inserted;
    console.log('SEED:' + seed + ', INSERTED:' + inserted);

    const { getTursoClient } = await import('@/utils/turso');
    const db = getTursoClient();
    const check = await db.execute({ sql: 'SELECT keyword FROM keywords WHERE keyword = ?', args: [seed] });
    console.log('CHECK:' + (check.rows.length > 0 ? 'OK' : 'FAIL'));
}
test();
