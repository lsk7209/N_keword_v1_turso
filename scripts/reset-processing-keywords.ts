import { getTursoClient } from '../src/utils/turso';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
    const db = getTursoClient();

    try {
        console.log('🔍 Processing 상태(2) 키워드 확인 중...');
        const countResult = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2');
        const count = countResult.rows[0].count as number;
        console.log(`📋 현재 Processing 상태로 멈춘 키워드: ${count.toLocaleString()}개`);

        if (count === 0) {
            console.log('✅ 리셋할 키워드가 없습니다.');
            return;
        }

        console.log('♻️ 키워드 리셋 시작...');
        const updateResult = await db.execute({
            sql: 'UPDATE keywords SET is_expanded = 0 WHERE is_expanded = 2',
            args: []
        });

        console.log(`✅ ${updateResult.rowsAffected.toLocaleString()}개 키워드가 성공적으로 리셋되었습니다.`);
        console.log('이제 다시 수집이 가능합니다.');

    } catch (error: any) {
        console.error('❌ 에러 발생:', error.message);
    }
}

main();
