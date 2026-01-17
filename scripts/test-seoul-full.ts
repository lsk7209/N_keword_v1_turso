import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const res = await db.execute({ sql: 'SELECT * FROM keywords WHERE keyword = ?', args: ['SEOUL'] });
    console.log(JSON.stringify(res.rows[0], null, 2));
}

check();
