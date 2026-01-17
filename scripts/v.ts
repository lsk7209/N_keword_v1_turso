
import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    const db = getTursoClient();
    const t = await db.execute('SELECT COUNT(*) as c FROM keywords');
    const r = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-30 minutes")');
    const u = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE updated_at > datetime("now", "-30 minutes")');
    console.log('T:' + t.rows[0].c + ',R:' + r.rows[0].c + ',U:' + u.rows[0].c);
}
verify();
