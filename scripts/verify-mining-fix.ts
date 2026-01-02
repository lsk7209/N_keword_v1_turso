
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runMiningBatch } from '../src/utils/batch-runner';
import { getTursoClient } from '../src/utils/turso';

async function verify() {
    console.log('🔍 Starting Mining Verification...');

    // 1. 실행 전 상태 확인
    const db = getTursoClient();
    const before = await db.execute(`
        SELECT 
            SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as expanded,
            SUM(CASE WHEN is_expanded = 2 THEN 1 ELSE 0 END) as processing
        FROM keywords
    `);
    console.log('📊 Before Batch:', JSON.stringify(before.rows[0]));

    // 2. 배치 실행 (Expand + FillDocs)
    console.log('🚀 Running Mining Batch...');
    try {
        // 강제로 소규모 배치 실행을 유도하기 위해 runMiningBatch 호출
        // (내부적으로 파라미터를 사용하므로 여기서는 호출만 함)
        const result = await runMiningBatch();

        console.log('✅ Batch Result:', JSON.stringify(result, null, 2));

        if (result.success) {
            if (result.expand && result.expand.processedSeeds > 0) {
                console.log(`✨ SUCCESS: Expanded ${result.expand.processedSeeds} seeds!`);
            } else {
                console.log('⚠️ Warning: No seeds expanded (might be normal if no seeds available, but check logs)');
            }

            if (result.fillDocs && result.fillDocs.processed > 0) {
                console.log(`✨ SUCCESS: Filled docs for ${result.fillDocs.processed} keywords!`);
            }
        } else {
            console.error('❌ Batch Failed:', result.error);
        }

    } catch (e) {
        console.error('❌ Execution Error:', e);
    }

    // 3. 실행 후 상태 확인
    const after = await db.execute(`
        SELECT 
            SUM(CASE WHEN is_expanded = 1 THEN 1 ELSE 0 END) as expanded,
            SUM(CASE WHEN is_expanded = 2 THEN 1 ELSE 0 END) as processing
        FROM keywords
    `);
    console.log('📊 After Batch:', JSON.stringify(after.rows[0]));
}

verify();
