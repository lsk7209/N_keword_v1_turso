
import { keyManager } from './src/utils/key-manager';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function check() {
    const log: string[] = [];
    log.push(`Time: ${new Date().toISOString()}`);
    log.push(`NAVER_SEARCH_API_KEYS length: ${process.env.NAVER_SEARCH_API_KEYS?.length || 0}`);
    log.push(`NAVER_AD_API_KEYS length: ${process.env.NAVER_AD_API_KEYS?.length || 0}`);

    try {
        const searchCount = keyManager.getKeyCount('SEARCH');
        const adCount = keyManager.getKeyCount('AD');
        log.push(`KeyManager Search Keys: ${searchCount}`);
        log.push(`KeyManager Ad Keys: ${adCount}`);

        if (searchCount > 0) {
            const key = keyManager.getNextKey('SEARCH');
            log.push(`Next Search Key ID: ${key.id.substring(0, 5)}...`);
        }
    } catch (e: any) {
        log.push(`Error checking KeyManager: ${e.message}`);
    }

    fs.writeFileSync('debug-output.txt', log.join('\n'));
    console.log('Validating keys done, wrote to debug-output.txt');
}

check();
