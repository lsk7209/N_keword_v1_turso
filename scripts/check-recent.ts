
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function check() {
    const db = getTursoClient();
    const res = await db.execute("SELECT COUNT(*) as recent_updates FROM keywords WHERE updated_at > datetime('now', '-5 minutes')");
    console.log('RECENT UPDATES:', res.rows[0].recent_updates);
}
check();
