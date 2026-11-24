import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { GET as updateStats } from '../src/app/api/cron/update-stats/route';
import { GET as executeMiner } from '../src/app/api/miner/execute/route';
import { authorizeCronRequest } from '../src/utils/cron-auth';

test('configured cron secret requires an exact Bearer token', () => {
    assert.deepEqual(authorizeCronRequest('Bearer test-only-secret', 'test-only-secret'), { ok: true });
    assert.equal(authorizeCronRequest('Bearer wrong-secret', 'test-only-secret').ok, false);
});

test('scheduled routes reject missing and invalid authentication before doing work', async () => {
    const original = process.env.CRON_SECRET;
    try {
        for (const route of [updateStats, executeMiner]) {
            delete process.env.CRON_SECRET;
            const missingConfig = await route(new NextRequest('http://localhost/api/miner/execute'));
            assert.equal(missingConfig.status, 503);

            process.env.CRON_SECRET = 'test-only-secret';
            const rejectedHeaders: Record<string, string>[] = [
                {},
                { authorization: 'Bearer wrong-secret' },
                { 'x-vercel-cron': '1' },
                { CRON_SECRET: 'test-only-secret' },
            ];
            for (const headers of rejectedHeaders) {
                const request = new NextRequest('http://localhost/api/miner/execute?key=test-only-secret', { headers });
                const response = await route(request);
                assert.equal(response.status, 401);
            }
        }
    } finally {
        if (original === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = original;
    }
});
