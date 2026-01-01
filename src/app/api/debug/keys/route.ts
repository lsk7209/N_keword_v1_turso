import { NextResponse } from 'next/server';
import { keyManager } from '@/utils/key-manager';

export async function GET() {
    const adStatus = keyManager.getStatusSummary('AD');
    const searchStatus = keyManager.getStatusSummary('SEARCH');

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        env_check: {
            NAVER_AD_API_KEYS_SET: !!process.env.NAVER_AD_API_KEYS,
            NAVER_SEARCH_API_KEYS_SET: !!process.env.NAVER_SEARCH_API_KEYS,
            NAVER_AD_API_KEYS_LENGTH: process.env.NAVER_AD_API_KEYS?.length || 0,
            NAVER_SEARCH_API_KEYS_LENGTH: process.env.NAVER_SEARCH_API_KEYS?.length || 0,
        },
        api_keys: {
            ad: adStatus,
            search: searchStatus
        },
        note: "이 정보를 통해 Vercel 환경에서 API 키가 제대로 로드되는지 확인할 수 있습니다."
    });
}
