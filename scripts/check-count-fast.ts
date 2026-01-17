
import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    const result = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > "2025-12-31"');
    console.log('COUNT:' + result.rows[0].c);
}
check();
