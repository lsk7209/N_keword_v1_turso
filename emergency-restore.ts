import { getTursoClient } from './src/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function restore() {
    const db = getTursoClient();
    console.log('🚀 Starting Emergency Restoration of stuck keywords...');

    try {
        const res = await db.execute("UPDATE keywords SET total_doc_cnt = NULL WHERE total_doc_cnt = -2");
        console.log('✅ Restoration Complete!');
        console.log('   Rows Affected:', res.rowsAffected);
    } catch (e: any) {
        console.error('❌ Restoration Failed:', e.message);
    }
}

restore();
