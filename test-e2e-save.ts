
import { manualMining } from './src/app/actions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    console.log('--- Testing Manual Mining Save ---');
    // Using a very unique keyword to ensure we can find it
    const uniqueKeyword = '치킨배달맛집_' + Date.now();
    const result = await manualMining([uniqueKeyword]);
    console.log('Result:', JSON.stringify(result, null, 2));

    // Check DB for this keyword
    const { getTursoClient } = await import('./src/utils/turso');
    const db = getTursoClient();
    const dbCheck = await db.execute({
        sql: 'SELECT * FROM keywords WHERE keyword = ?',
        args: [uniqueKeyword]
    });
    console.log('DB Check for ' + uniqueKeyword + ':', dbCheck.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
}

test();
