import { NextResponse } from 'next/server';
import { updateSystemStats } from '@/utils/stats-updater';
import { authorizeCronRequest } from '@/utils/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const authorization = authorizeCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET);
    if (!authorization.ok) {
        return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    try {
        const result = await updateSystemStats();
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
