import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount } from '@/utils/naver-api';
import { calculateTierAndRatio, processSeedKeyword, bulkDeferredInsert, Keyword } from '@/utils/mining-engine';

export const dynamic = 'force-dynamic';

// POST: 큐에 등록 (즉시 응답)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const keywordsInput = body.keywords;

        if (!keywordsInput || !Array.isArray(keywordsInput)) {
            return NextResponse.json({ error: 'Invalid keywords input' }, { status: 400 });
        }

        // 1. Normalize keywords
        const seeds = Array.from(new Set(
            keywordsInput
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0)
        ));

        if (seeds.length === 0) {
            return NextResponse.json({ error: 'No valid keywords provided' }, { status: 400 });
        }

        // 2. 큐에 등록
        const db = getTursoClient();
        const queueId = generateUUID();
        const now = getCurrentTimestamp();

        // bulk_queue 테이블이 없으면 생성
        await db.execute({
            sql: `CREATE TABLE IF NOT EXISTS bulk_queue (
                id TEXT PRIMARY KEY,
                seeds TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                total_seeds INTEGER DEFAULT 0,
                processed_seeds INTEGER DEFAULT 0,
                result_count INTEGER DEFAULT 0,
                error TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )`,
            args: []
        });

        await db.execute({
            sql: `INSERT INTO bulk_queue (id, seeds, status, total_seeds, created_at, updated_at) 
                  VALUES (?, ?, 'pending', ?, ?, ?)`,
            args: [queueId, JSON.stringify(seeds), seeds.length, now, now]
        });

        return NextResponse.json({
            queueId,
            status: 'queued',
            message: `${seeds.length}개 키워드가 수집 대기열에 추가되었습니다. 백그라운드에서 완전 수집됩니다.`,
            estimatedTime: '최대 15분 (다음 cron 실행 시)'
        });

    } catch (e: any) {
        console.error('Bulk queue API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: 큐 상태 및 결과 조회
export async function GET(req: NextRequest) {
    try {
        const queueId = req.nextUrl.searchParams.get('id');

        if (!queueId) {
            return NextResponse.json({ error: 'Queue ID required' }, { status: 400 });
        }

        const db = getTursoClient();

        // 큐 상태 조회
        const result = await db.execute({
            sql: `SELECT * FROM bulk_queue WHERE id = ?`,
            args: [queueId]
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Queue not found' }, { status: 404 });
        }

        const queue = result.rows[0];
        const status = String(queue.status);

        // 완료된 경우: 결과 데이터 조회
        if (status === 'completed') {
            const seeds = JSON.parse(String(queue.seeds)) as string[];

            // 수집된 키워드들 조회 (seeds에서 파생된 연관 키워드 포함)
            // 최근 업데이트된 1000개 제한 (tier 우선 정렬)
            const keywordsResult = await db.execute({
                sql: `SELECT * FROM keywords 
                      WHERE total_search_cnt >= 1000 
                      AND updated_at >= datetime(?, '-1 hour')
                      ORDER BY 
                        CASE tier 
                          WHEN 'PLATINUM' THEN 1 
                          WHEN 'GOLD' THEN 2 
                          WHEN 'SILVER' THEN 3 
                          ELSE 4 
                        END,
                        total_search_cnt DESC
                      LIMIT 1000`,
                args: [String(queue.updated_at)]
            });

            return NextResponse.json({
                queueId,
                status: 'completed',
                totalSeeds: queue.total_seeds,
                processedSeeds: queue.processed_seeds,
                resultCount: keywordsResult.rows.length,
                data: keywordsResult.rows
            });
        }

        // 진행 중 또는 대기 중
        return NextResponse.json({
            queueId,
            status,
            totalSeeds: queue.total_seeds,
            processedSeeds: queue.processed_seeds,
            resultCount: queue.result_count || 0,
            error: queue.error || null,
            message: status === 'processing'
                ? `처리 중... (${queue.processed_seeds}/${queue.total_seeds})`
                : '대기 중입니다. 곧 백그라운드에서 처리됩니다.'
        });

    } catch (e: any) {
        console.error('Bulk queue status API Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
