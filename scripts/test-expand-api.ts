/**
 * 자동수집 API 테스트 스크립트
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const PROD_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'manual-override-key';

async function testExpandAPI() {
    console.log('🔍 자동수집 API 테스트 중...\n');
    console.log(`URL: ${PROD_URL}/api/miner/execute`);
    console.log(`Secret: ${CRON_SECRET.substring(0, 10)}...\n`);

    try {
        const query = new URLSearchParams({
            task: 'expand',
            mode: 'TURBO',
            expandBatch: '10',
            expandConcurrency: '5',
            minSearchVolume: '1000',
            maxRunMs: '30000'
        });

        const url = `${PROD_URL}/api/miner/execute?${query.toString()}`;
        console.log(`📡 호출 URL: ${url}\n`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'CRON_SECRET': CRON_SECRET
            }
        });

        const data = await response.json();

        console.log('─'.repeat(100));
        console.log('📊 응답 결과');
        console.log('─'.repeat(100));
        console.log(`HTTP Status: ${response.status}`);
        console.log(`Success: ${data.success}`);
        console.log(`Mode: ${data.mode}`);
        console.log(`Task: ${data.task}`);
        console.log('');

        if (data.expand) {
            console.log('📈 EXPAND 작업 결과:');
            console.log(`  - Total Saved: ${data.expand.totalSaved || 0}`);
            console.log(`  - Total Processed: ${data.expand.totalProcessed || 0}`);
            console.log(`  - Details: ${JSON.stringify(data.expand.details || [], null, 2)}`);
            console.log('');
        } else {
            console.log('⚠️ EXPAND 작업 결과가 없습니다.');
            console.log('');
        }

        if (data.fillDocs) {
            console.log('📈 FILL_DOCS 작업 결과:');
            console.log(`  - Processed: ${data.fillDocs.processed || 0}`);
            console.log(`  - Failed: ${data.fillDocs.failed || 0}`);
            console.log('');
        }

        if (data.error) {
            console.log('❌ 에러:');
            console.log(`  ${data.error}`);
            console.log('');
        }

        if (data.info) {
            console.log('ℹ️ 정보:');
            console.log(`  ${data.info}`);
            console.log('');
        }

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

testExpandAPI();

