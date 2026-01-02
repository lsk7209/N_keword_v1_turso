
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function getIndexes() {
    const db = getTursoClient();
    try {
        const r = await db.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='keywords'");
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}

getIndexes();
