
import { NextRequest, NextResponse } from 'next/server';
import { processSeedKeyword } from '@/utils/mining-engine';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('CRON_SECRET');
        const queryKey = req.nextUrl.searchParams.get('key');
        const secret = process.env.CRON_SECRET;

        if (!secret || (authHeader !== secret && queryKey !== secret)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { keywords } = await req.json();

        if (!keywords || !Array.isArray(keywords)) {
            return NextResponse.json({ error: 'Keywords must be an array' }, { status: 400 });
        }

        const seeds = keywords
            .map(k => k.trim())
            .filter(Boolean)
            .slice(0, 5); // Limit 5

        if (seeds.length === 0) {
            return NextResponse.json({ error: 'No valid keywords provided' }, { status: 400 });
        }

        const results = [];

        for (const seed of seeds) {
            try {
                // For manual collection, we want to fetch document counts as well.
                // Limit to 30 to avoid timeout (Vercel 60s limit)
                // 100 was too slow - each doc count takes ~500ms
                // Limit to 30 items for full doc count check to avoid timeout
                // Filter: Min Volume 100, Max Items 300 (User Request)
                const result = await processSeedKeyword(seed, 30, false, 100, 300);
                results.push({
                    seed,
                    success: true,
                    data: result.items,
                    stats: { processed: result.processed, saved: result.saved }
                });
            } catch (e: any) {
                results.push({
                    seed,
                    success: false,
                    error: e.message
                });
            }
        }

        return NextResponse.json({ results });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
