import dotenv from 'dotenv';
import { resolve } from 'path';

// Load Environment Variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { updateSystemStats } from '@/utils/stats-updater';

async function main() {
    console.log('🔄 Running Manual Stats Update...');
    try {
        await updateSystemStats();
        console.log('✅ Update Complete');
        process.exit(0);
    } catch (e) {
        console.error('❌ Update Failed:', e);
        process.exit(1);
    }
}

main();
