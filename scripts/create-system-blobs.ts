
import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function createSystemBlobsTable() {
    const db = getTursoClient();
    await db.execute(`
        CREATE TABLE IF NOT EXISTS system_blobs (
            key TEXT PRIMARY KEY,
            value BLOB,
            updated_at TEXT
        )
    `);
    console.log('✅ system_blobs table created!');
}

createSystemBlobsTable().catch(console.error);
