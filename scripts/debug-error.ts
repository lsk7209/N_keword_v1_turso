import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { manualMining } from '@/app/actions';

async function test() {
    const res = await manualMining(['치킨']);
    console.log('ERROR:', JSON.stringify(res, null, 2));
}
test();
