import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function fix() {
    const db = getTursoClient();

    // Mining mode를 TURBO로 설정
    await db.execute({
        sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        args: ['mining_mode', 'TURBO', new Date().toISOString()]
    });

    console.log('✅ Mining mode set to TURBO');

    // 확인
    const check = await db.execute('SELECT value FROM settings WHERE key = "mining_mode"');
    console.log('Current mode:', check.rows[0]?.value);
}

fix();
