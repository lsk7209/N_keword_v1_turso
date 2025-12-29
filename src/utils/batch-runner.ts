// ... existing code ...

    // === Task 2: FILL_DOCS (Document Counts) ===
    const taskFillDocs = async () => {
        if (task === 'expand') return null;

        const BATCH_SIZE = FILL_DOCS_BATCH;
        const CONCURRENCY = FILL_DOCS_CONCURRENCY;

        // 🚀 터보모드: 최대 실행 시간 확대 (55초 → 58초)로 더 많은 처리
        const maxRunMs = clampInt(options.maxRunMs, 10_000, 58_000, 58_000);
        const deadline = start + maxRunMs;

        // 🚀 획기적 최적화: 메모리 기반 문서 수집 결과 축적
        let memoryDocUpdates: { id: string, counts: any }[] = [];

        // 🚀 Atomic Claim: 문서 수집 대상 선점 (-2: Processing)
        let docsToFill: any[] = [];
        try {
            const claimResult = await db.execute({
                sql: `UPDATE keywords
                      SET total_doc_cnt = -2
                      WHERE id IN (
                          SELECT id FROM keywords
                          WHERE total_doc_cnt IS NULL
                          ORDER BY total_search_cnt DESC
                          LIMIT ?
                      )
                      RETURNING id, keyword, total_search_cnt`,
                args: [BATCH_SIZE]
            });

            docsToFill = claimResult.rows.map(row => ({
                id: row.id as string,
                keyword: row.keyword as string,
                total_search_cnt: row.total_search_cnt as number
            }));
        } catch (e: any) {
            console.error('[Batch] FillDocs Claim Failed:', e);
            return null;
        }

        if (!docsToFill || docsToFill.length === 0) return null;

        console.log(`[Batch] FILL_DOCS: Claimed ${docsToFill.length} items (Concurrency ${CONCURRENCY}, Deadline in ${(deadline - Date.now())}ms)`);
        let stopDueToDeadline = false;

        const processedResults = await mapWithConcurrency(docsToFill, CONCURRENCY, async (item) => {
            // 🚀 터보모드: deadline 체크 완화 (2500ms → 1000ms)로 더 많은 키워드 처리
            if (Date.now() > (deadline - 1000)) {
                stopDueToDeadline = true;
                return { status: 'skipped_deadline', item };
            }
            try {
                const counts = await fetchDocumentCount(item.keyword);
                // 🚀 메모리에만 저장, DB Write 없음
                memoryDocUpdates.push({ id: item.id, counts });
                return { status: 'fulfilled', item, counts };
            } catch (e: any) {
                console.error(`[Batch] Error filling ${item.keyword}: ${e.message}`);
                return { status: 'rejected', keyword: item.keyword, error: e.message };
            }
        });

        // 🚀 단일 배치 UPDATE: 모든 문서 수를 한 번에 업데이트 (Write: 1회)
        if (memoryDocUpdates.length > 0) {
            const updateStatements = memoryDocUpdates.map(({ id, counts }) => ({
                sql: `UPDATE keywords SET
                    total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                    web_doc_cnt = ?, news_doc_cnt = ?, updated_at = ?
                    WHERE id = ?`,
                args: [
                    counts.total, counts.blog || 0, counts.cafe || 0,
                    counts.web || 0, counts.news || 0, getCurrentTimestamp(), id
                ]
            }));

            try {
                await db.batch(updateStatements);
                console.log(`[Batch] ⚡ Bulk Doc Update: ${memoryDocUpdates.length} documents in 1 batch`);
            } catch (e) {
                console.error('[Batch] Bulk doc update failed:', e);
            }
            // 메모리 버퍼 초기화
            memoryDocUpdates = [];
        }

        const succeeded = processedResults.filter(r => r.status === 'fulfilled');
        const failed = processedResults.filter(r => r.status === 'rejected');
        const skipped = processedResults.filter(r => r.status === 'skipped_deadline');

        // 스킵된 항목은 -2 -> NULL로 롤백해야 다시 잡힘
        if (skipped.length > 0) {
            const skippedIds = skipped.map(r => r.item.id);
            const placeholders = skippedIds.map(() => '?').join(',');
            await db.execute({
                sql: `UPDATE keywords SET total_doc_cnt = NULL WHERE id IN (${placeholders})`,
                args: skippedIds
            });
        }

        return {
            processed: succeeded.length,
            failed: failed.length,
            skipped: skipped.length,
            details: processedResults.map((r: any) => {
                if (r.status === 'fulfilled') return `${r.item.keyword}: ${r.counts.total}`;
                if (r.status === 'rejected') return `${r.keyword}: ERROR`;
                return `${r.item.keyword}: SKIPPED`;
            })
        };
    };

    // ... rest of the function ...
}