
import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    const db = getTursoClient();
    // Use a very broad date check to see anything recent
    const result = await db.execute('SELECT keyword, created_at FROM keywords WHERE created_at LIKE "2026-01-01%" OR created_at LIKE "2025-12-31%"');
    console.log('COUNT: ' + result.rows.length);
    result.rows.forEach(r => console.log(r.keyword + ' (' + r.created_at + ')'));
}
check();
