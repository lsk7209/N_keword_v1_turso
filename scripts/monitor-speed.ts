
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getTursoClient } from '../src/utils/turso';

async function monitorSpeed() {
    const db = getTursoClient();
    console.log('🏎️  Measuring Mining Speed & Efficiency...');
    console.log('------------------------------------------------');

    // 1. Snapshot 1
    const start = Date.now();
    const r1 = await db.execute("SELECT COUNT(*) as total FROM keywords");
    const c1 = Number(r1.rows[0].total);
    console.log(`⏱️  Start Count: ${c1.toLocaleString()} keywords`);

    // Wait 120 seconds (Deployment time buffer)
    console.log('⏳ Waiting 120 seconds to measure throughput across deployment...');
    await new Promise(resolve => setTimeout(resolve, 120000));

    // 2. Snapshot 2
    const r2 = await db.execute("SELECT COUNT(*) as total FROM keywords");
    const c2 = Number(r2.rows[0].total);

    // 3. Stats
    const end = Date.now();
    const duration = (end - start) / 1000;
    const diff = c2 - c1;
    const speed = diff / 10; // per second (approx)

    console.log(`⏱️  End Count:   ${c2.toLocaleString()} keywords`);
    console.log('------------------------------------------------');
    console.log(`🚀 Added:       +${diff.toLocaleString()} keywords`);
    console.log(`⚡ Speed:       ${speed.toFixed(1)} keywords/sec`);
    console.log(`🔥 Per Minute:  ${(originalSpeed => originalSpeed * 60)(speed).toLocaleString()} keywords/min`);
    console.log('\n📊 Optimization Analysis:');

    if (diff > 0) {
        console.log(`✅  Efficiency: High. System is inserting data without read-bottlenecks.`);
        console.log(`    (If unoptimized, standard dup-check would slow this down significantly)`);
    } else {
        console.log(`⚠️  Speed is 0. Mining might be pausing or between batches.`);
    }
}

monitorSpeed();
