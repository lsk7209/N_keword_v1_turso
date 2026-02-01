import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
    const db = getTursoClient();

    try {
        console.log('🧹 Starting Database VACUUM operation...');
        console.log('This will rebuild the database file, repacking it into a minimal amount of disk space.');

        await db.execute('VACUUM');

        console.log('✅ VACUUM completed successfully.');
        console.log('Storage space should be optimized.');

    } catch (error: any) {
        console.error('❌ VACUUM Failed:', error.message);
    }
}

main();
