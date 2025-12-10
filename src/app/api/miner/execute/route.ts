
import { NextRequest, NextResponse } from 'next/server';
import { runMiningBatch } from '@/utils/batch-runner';

// Set Vercel Function config
export const maxDuration = 60; // 60 seconds strict
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. Auth Check (Allow if CRON_SECRET header matches OR manual key param matches)
    const authHeader = req.headers.get('CRON_SECRET');
    const queryKey = req.nextUrl.searchParams.get('key');
    const secret = process.env.CRON_SECRET;

    const isAuthorized = (authHeader === secret) || (queryKey === secret);

    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await runMiningBatch();
        return NextResponse.json(result);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
