
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Now import after env is loaded
import { manualMining } from './src/app/actions';
import { getTursoClient } from './src/utils/turso';

async function test() {
    const seed = 'TEST_DEBUG_' + Date.now();
    console.log('--- Testing Manual Mining Save for ' + seed + ' ---');
    const res = await manualMining([seed]);

    // @ts-ignore
    const resultObj = res.results?.[0];
    const inserted = resultObj?.stats?.inserted;
    console.log('RESULT_SUCCESS:' + resultObj?.success);
    console.log('INSERTED_COUNT:' + inserted);

    const db = getTursoClient();
    const check = await db.execute({ sql: 'SELECT keyword FROM keywords WHERE keyword = ?', args: [seed] });
    console.log('DB_CHECK:' + (check.rows.length > 0 ? 'FOUND' : 'NOT FOUND'));
}
test();
