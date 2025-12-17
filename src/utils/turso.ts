import { createClient } from '@libsql/client';

// Turso 클라이언트 생성 (싱글톤 패턴)
let tursoClient: ReturnType<typeof createClient> | null = null;

export function getTursoClient() {
    if (tursoClient) return tursoClient;

    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables');
    }

    tursoClient = createClient({
        url,
        authToken,
    });

    return tursoClient;
}

// 공개 클라이언트 (읽기 전용, 클라이언트 사이드에서 사용 가능)
export function getPublicTursoClient() {
    const url = process.env.NEXT_PUBLIC_TURSO_DATABASE_URL;
    const authToken = process.env.NEXT_PUBLIC_TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.warn('⚠️ Warning: Missing NEXT_PUBLIC_TURSO environment variables. Using placeholder values for build.');
        // 빌드 시 placeholder 반환 (실제 연결은 실패하지만 빌드는 통과)
        return createClient({
            url: 'libsql://placeholder.turso.io',
            authToken: 'placeholder-token',
        });
    }

    return createClient({
        url,
        authToken,
    });
}

// UUID 생성 헬퍼 (SQLite는 UUID 타입이 없으므로 crypto.randomUUID() 사용)
export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// 현재 시간을 ISO 8601 형식으로 반환
export function getCurrentTimestamp(): string {
    return new Date().toISOString();
}

