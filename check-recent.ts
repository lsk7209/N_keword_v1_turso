import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkRecentActivity() {
    const db = getTursoClient();

    console.log('Checking for ANY activity in the last 30 minutes...');

    const recent = await db.execute(`
        SELECT count(*) as count 
        FROM keywords 
        WHERE created_at > datetime('now', '-30 minutes')
    `);

    const updated = await db.execute(`
        SELECT count(*) as count 
        FROM keywords 
        WHERE updated_at > datetime('now', '-30 minutes')
    `);

    console.log(`NEW Keywords (last 30m): ${recent.rows[0].count}`);
    console.log(`UPDATED Keywords (last 30m): ${updated.rows[0].count}`);

    // Check stuck again
    const stuck = await db.execute(`
        SELECT count(*) as count
        FROM keywords
        WHERE is_expanded = 2 
        AND datetime(updated_at) < datetime('now', '-10 minutes')
    `);
    console.log(`STUCK Processing (>10m ago): ${stuck.rows[0].count}`);
}

checkRecentActivity();
