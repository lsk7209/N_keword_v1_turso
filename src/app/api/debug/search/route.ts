import { NextResponse } from 'next/server';
import { fetchDocumentCount } from '@/utils/naver-api';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '테스트';

    console.log('[Test] Testing Search API with keyword:', keyword);

    try {
        const result = await fetchDocumentCount(keyword);

        return NextResponse.json({
            success: true,
            keyword,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('[Test] Search API Error:', error);
        return NextResponse.json({
            success: false,
            keyword,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
