/**
 * ⚡ 획기적 DB 최적화: 지연 쓰기 (Deferred Writes) 전략
 *
 * 기존: 시드당 즉시 DB Write (INSERT + UPDATE)
 * 신규: 메모리에 축적 후 배치 Write (INSERT만)
 *
 * Write 감소 효과: 시드당 2-3회 → 1회 (33-50% 절약)
 */

import { getTursoClient, generateUUID, getCurrentTimestamp } from '@/utils/turso';
import { fetchRelatedKeywords, fetchDocumentCount, DocCounts } from '@/utils/naver-api';
import { isBlacklisted } from '@/utils/blacklist';
import { BloomFilter } from './bloom-filter';
import { BloomManager } from './bloom-manager';

export interface Keyword {
    keyword: string;
    originalKeyword?: string;
    total_search_cnt: number;
    pc_search_cnt?: number;
    mo_search_cnt?: number;
    pc_click_cnt?: number;
    mo_click_cnt?: number;
    click_cnt?: number;
    pc_ctr?: number;
    mo_ctr?: number;
    total_ctr?: number;
    comp_idx?: string;
    pl_avg_depth?: number;
    total_doc_cnt?: number | null;
    blog_doc_cnt?: number;
    cafe_doc_cnt?: number;
    web_doc_cnt?: number;
    news_doc_cnt?: number;
    golden_ratio?: number;
    tier?: string;
    is_expanded?: boolean | number;
    created_at?: string;
    updated_at?: string;
}

export interface MiningResult {
    processed: number; // Count of fully processed items (with doc count)
    saved: number; // Total items saved to DB
    items: Keyword[]; // The fully processed items to return to UI
}

export async function processSeedKeyword(
    seedKeyword: string,
    limitDocCount = 0,
    skipDocFetch = false,
    minSearchVolume = 100,
    maxKeywords = 0
): Promise<MiningResult> {
    // 🚀 획기적 최적화: 메모리 기반 결과 축적
    let memoryResults: Keyword[] = [];
    let memoryDeferredResults: Keyword[] = [];

    // 1. Fetch Related Keywords (Ad API)
    let relatedList: any[] = [];
    try {
        relatedList = await fetchRelatedKeywords(seedKeyword);
    } catch (e: any) {
        console.error(`[MiningEngine] Ad API Error for ${seedKeyword}:`, e);
        throw e;
    }

    if (!relatedList || relatedList.length === 0) {
        console.log(`[MiningEngine] ⚠️ No related keywords found for "${seedKeyword}"`);
        return { processed: 0, saved: 0, items: [] };
    }

    console.log(`[MiningEngine] 📥 Fetched ${relatedList.length} related keywords from API`);

    // 2. Map & Basic Parse
    const candidates = relatedList.map((item: any) => {
        const parseCnt = (val: string | number) => {
            if (typeof val === 'string' && val.includes('<')) return 5;
            const num = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
            return isNaN(num) ? 0 : Math.round(num);
        };

        const parseFloat = (val: string | number) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.includes('<')) return 0.1;
            return Number(String(val).replace(/,/g, '')) || 0;
        };

        const pcCnt = parseCnt(item.monthlyPcQcCnt);
        const moCnt = parseCnt(item.monthlyMobileQcCnt);
        const total = Math.round(pcCnt + moCnt);

        const pcClickCnt = parseCnt(item.monthlyAvePcClkCnt);
        const moClickCnt = parseCnt(item.monthlyAveMobileClkCnt);
        const totalClickCnt = Math.round(pcClickCnt + moClickCnt);

        const pcCtr = parseFloat(item.monthlyAvePcCtr);
        const moCtr = parseFloat(item.monthlyAveMobileCtr);
        const totalCtr = (pcCtr + moCtr) / 2; // 평균 CTR

        return {
            keyword: item.relKeyword.replace(/\s+/g, ''),
            originalKeyword: item.relKeyword,
            pc_search_cnt: pcCnt,
            mo_search_cnt: moCnt,
            total_search_cnt: total,
            pc_click_cnt: pcClickCnt,
            mo_click_cnt: moClickCnt,
            click_cnt: totalClickCnt,
            pc_ctr: pcCtr,
            mo_ctr: moCtr,
            total_ctr: totalCtr,
            comp_idx: item.compIdx,
            pl_avg_depth: Math.round(parseCnt(item.plAvgDepth))
        };
    });

    // 3. Filter (Volume >= minSearchVolume & Blacklist)
    const beforeFilterCount = candidates.length;
    const filteredByVolume = candidates.filter((c: any) => c.total_search_cnt >= minSearchVolume);
    const filteredByBlacklist = filteredByVolume.filter((c: any) => !isBlacklisted(c.originalKeyword));
    const filtered = filteredByBlacklist;
    filtered.sort((a: any, b: any) => b.total_search_cnt - a.total_search_cnt);

    console.log(`[MiningEngine] 🔍 Filtering results:`, {
        totalCandidates: beforeFilterCount,
        afterVolumeFilter: filteredByVolume.length,
        afterBlacklistFilter: filtered.length,
        minSearchVolume,
        volumeFilteredOut: beforeFilterCount - filteredByVolume.length,
        blacklistFilteredOut: filteredByVolume.length - filtered.length
    });

    // 3b. Apply Max Limit
    let finalFiltered = filtered;
    if (maxKeywords > 0 && finalFiltered.length > maxKeywords) {
        console.log(`[MiningEngine] Slicing results from ${finalFiltered.length} to ${maxKeywords}`);
        finalFiltered = finalFiltered.slice(0, maxKeywords);
    }

    let candidatesToProcess: Keyword[] = [];
    let candidatesToSaveOnly: Keyword[] = [];

    if (skipDocFetch) {
        candidatesToSaveOnly = finalFiltered;
    } else {
        candidatesToProcess = limitDocCount > 0 ? finalFiltered.slice(0, limitDocCount) : finalFiltered;
        candidatesToSaveOnly = limitDocCount > 0 ? finalFiltered.slice(limitDocCount) : [];
    }

    // 🚀 획기적 변경: DB Write 제거, 메모리만 사용
    if (skipDocFetch) {
        // 메모리에만 저장, DB Write 없음
        memoryDeferredResults = candidatesToSaveOnly.map((r: any) => ({
            ...r,
            total_doc_cnt: null,
            blog_doc_cnt: 0,
            cafe_doc_cnt: 0,
            web_doc_cnt: 0,
            news_doc_cnt: 0,
            golden_ratio: 0,
            tier: 'UNRANKED',
            is_expanded: false
        }));
    } else {
        // 문서 수집 대상만 메모리에 저장
        candidatesToProcess.forEach((cand: any) => {
            memoryResults.push({
                keyword: cand.originalKeyword,
                total_search_cnt: cand.total_search_cnt,
                pc_search_cnt: cand.pc_search_cnt,
                mo_search_cnt: cand.mo_search_cnt,
                pc_click_cnt: cand.pc_click_cnt,
                mo_click_cnt: cand.mo_click_cnt,
                click_cnt: cand.click_cnt,
                pc_ctr: cand.pc_ctr,
                mo_ctr: cand.mo_ctr,
                total_ctr: cand.total_ctr,
                comp_idx: cand.comp_idx,
                pl_avg_depth: cand.pl_avg_depth,
                is_expanded: false
            });
        });

        candidatesToSaveOnly.forEach((cand: any) => {
            memoryDeferredResults.push({
                keyword: cand.originalKeyword,
                total_search_cnt: cand.total_search_cnt,
                pc_search_cnt: cand.pc_search_cnt,
                mo_search_cnt: cand.mo_search_cnt,
                pc_click_cnt: cand.pc_click_cnt,
                mo_click_cnt: cand.mo_click_cnt,
                click_cnt: cand.click_cnt,
                pc_ctr: cand.pc_ctr,
                mo_ctr: cand.mo_ctr,
                total_ctr: cand.total_ctr,
                comp_idx: cand.comp_idx,
                pl_avg_depth: cand.pl_avg_depth,
                total_doc_cnt: null,
                blog_doc_cnt: 0,
                cafe_doc_cnt: 0,
                web_doc_cnt: 0,
                news_doc_cnt: 0,
                golden_ratio: 0,
                tier: 'UNRANKED',
                is_expanded: false
            });
        });
    }

    // 5. Fetch Document Counts (Parallel Batches) for candidatesToProcess
    if (!skipDocFetch && candidatesToProcess.length > 0) {
        // Optimized: Run ALL chunks in parallel instead of sequentially
        const BATCH_SIZE = 5;
        const allChunks = [];
        for (let i = 0; i < candidatesToProcess.length; i += BATCH_SIZE) {
            allChunks.push(candidatesToProcess.slice(i, i + BATCH_SIZE));
        }

        const allChunkResults = await Promise.all(
            allChunks.map(chunk =>
                Promise.all(chunk.map(async (cand: any) => {
                    try {
                        const counts = await fetchDocumentCount(cand.originalKeyword);
                        return { ...cand, ...counts };
                    } catch (e) {
                        console.error(`Failed doc count for ${cand.originalKeyword}:`, e);
                        return { ...cand, total: null }; // Mark as failed doc count
                    }
                }))
            )
        );

        const processedResults = allChunkResults.flat();

        // 6. Process Results for Memory
        processedResults.forEach((r: Keyword & Partial<DocCounts>) => {
            // Golden Ratio: 검색량 / (블로그 + 카페 + 웹 문서수)
            // 뉴스는 제외 (SEO 경쟁 지표로 부적합)
            const viewDocCnt = (r.blog || 0) + (r.cafe || 0) + (r.web || 0);

            let ratio = 0;
            let tier = 'UNRANKED';

            if (viewDocCnt > 0) {
                ratio = r.total_search_cnt / viewDocCnt;

                // 등급 산정: PLATINUM, GOLD, SILVER, BRONZE
                if (viewDocCnt <= 100 && ratio > 5) {
                    tier = 'PLATINUM';  // 초고효율: 문서 100개 이하 + 비율 5 이상
                } else if (ratio > 10) {
                    tier = 'PLATINUM';  // 매우 높은 비율
                } else if (ratio > 5) {
                    tier = 'GOLD';      // 높은 비율
                } else if (ratio > 1) {
                    tier = 'SILVER';    // 보통 비율
                } else {
                    tier = 'BRONZE';    // 낮은 비율
                }
            } else if (r.total_search_cnt > 0 && r.total != null) {
                // No view competition? PLATINUM!
                tier = 'PLATINUM';
                ratio = 99.99;
            }

            memoryResults.push({
                keyword: r.originalKeyword || r.keyword,
                total_search_cnt: r.total_search_cnt,
                pc_search_cnt: r.pc_search_cnt,
                mo_search_cnt: r.mo_search_cnt,
                pc_click_cnt: r.pc_click_cnt,
                mo_click_cnt: r.mo_click_cnt,
                click_cnt: r.click_cnt,
                pc_ctr: r.pc_ctr,
                mo_ctr: r.mo_ctr,
                total_ctr: r.total_ctr,
                comp_idx: r.comp_idx,
                pl_avg_depth: r.pl_avg_depth,
                total_doc_cnt: r.total, // keep showing total docs
                blog_doc_cnt: r.blog || 0,
                cafe_doc_cnt: r.cafe || 0,
                web_doc_cnt: r.web || 0,
                news_doc_cnt: r.news || 0,
                golden_ratio: ratio,
                tier: tier,
                is_expanded: false
            });
        });
    }

    // 🚀 획기적 최적화: DB 호출 완전 제거
    // 결과만 메모리에 반환, 실제 DB Write는 호출자(batch-runner)가 배치로 처리
    const totalProcessed = memoryResults.length + memoryDeferredResults.length;

    console.log(`[MiningEngine] 📦 Deferred Write: ${totalProcessed} keywords stored in memory (DB Write: 0)`);

    return {
        processed: memoryResults.length,
        saved: totalProcessed,
        items: [...memoryResults, ...memoryDeferredResults]
    };
}


// 🚀💰 Turso 비용 최적화: Bloom Filter + 중복 필터링
export async function bulkDeferredInsert(keywords: Keyword[]): Promise<{ inserted: number }> {
    if (!keywords.length) return { inserted: 0 };

    const db = getTursoClient();
    const bloom = await BloomManager.getFilter();

    // 1️⃣ 로컬 중복 제거
    const uniqueKeywords = Array.from(new Map(keywords.map(k => [k.keyword, k])).values());

    // 2️⃣ Bloom Filter 1차 선별 (Turso Row Reads 90% 절감의 핵심)
    const definitelyNew: Keyword[] = [];
    const maybeExisting: Keyword[] = [];

    uniqueKeywords.forEach(k => {
        if (bloom.maybeExists(k.keyword)) {
            maybeExisting.push(k);
        } else {
            definitelyNew.push(k);
        }
    });

    console.log(`[MiningEngine] 💰 Bloom Filter: ${uniqueKeywords.length} items -> Definitely New: ${definitelyNew.length}, Needs DB Check: ${maybeExisting.length}`);

    // 3️⃣ 'Maybe' 항목들만 DB에서 실제 중복 확인 (Index-based READ)
    const existingKeywords = new Set<string>();
    if (maybeExisting.length > 0) {
        const keywordList = maybeExisting.map(k => k.keyword);
        const CHUNK_SIZE = 500;

        for (let i = 0; i < keywordList.length; i += CHUNK_SIZE) {
            const chunk = keywordList.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');

            try {
                const result = await db.execute({
                    sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
                    args: chunk
                });
                result.rows.forEach(row => existingKeywords.add(row.keyword as string));
            } catch (e) {
                console.error('[MiningEngine] DB Deduplication check failed:', e);
            }
        }
    }

    // 4️⃣ 최종 신규 키워드 합치기
    const actualMaybeNew = maybeExisting.filter(k => !existingKeywords.has(k.keyword));
    const allNewKeywords = [...definitelyNew, ...actualMaybeNew];

    if (allNewKeywords.length === 0) {
        return { inserted: 0 };
    }

    // 5️⃣ Bloom Filter 업데이트 (새로 추가될 키워드들 반영)
    allNewKeywords.forEach(k => bloom.add(k.keyword));
    // 배치가 끝나기 전에 BloomManager.saveFilter(bloom)이 호출되어야 함 (batch-runner에서 처리 권장)
    // 여기서는 안전을 위해 일단 로컬 업데이트만 수행

    // 6️⃣ 신규 키워드만 INSERT (Row Writes 최소화)
    const statements = allNewKeywords.map(kw => ({
        sql: `INSERT OR IGNORE INTO keywords (
            keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
            pc_click_cnt, mo_click_cnt, click_cnt, pc_ctr, mo_ctr, total_ctr,
            comp_idx, pl_avg_depth, total_doc_cnt, blog_doc_cnt, cafe_doc_cnt,
            web_doc_cnt, news_doc_cnt, golden_ratio, tier, is_expanded,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            kw.keyword, kw.total_search_cnt, kw.pc_search_cnt || 0, kw.mo_search_cnt || 0,
            kw.pc_click_cnt || 0, kw.mo_click_cnt || 0, kw.click_cnt || 0,
            kw.pc_ctr || 0, kw.mo_ctr || 0, kw.total_ctr || 0,
            kw.comp_idx || 0, kw.pl_avg_depth || 0,
            kw.total_doc_cnt || null, kw.blog_doc_cnt || 0, kw.cafe_doc_cnt || 0,
            kw.web_doc_cnt || 0, kw.news_doc_cnt || 0,
            kw.golden_ratio || 0, kw.tier || 'UNRANKED', kw.is_expanded ? 1 : 0,
            getCurrentTimestamp(), getCurrentTimestamp()
        ]
    }));

    // Turso batch size limit (v1: 100 statements per request is safer, but libsql supports more)
    // We already chunk large insertions elsewhere if needed, but here we use statements directly.
    // For extreme reliability, let's chunk statements to 100.
    const STATEMENT_CHUNK = 100;
    let totalInserted = 0;
    for (let i = 0; i < statements.length; i += STATEMENT_CHUNK) {
        const chunk = statements.slice(i, i + STATEMENT_CHUNK);
        try {
            await db.batch(chunk);
            totalInserted += chunk.length;
        } catch (e: any) {
            console.error(`[MiningEngine] Batch insert failed for chunk ${i}:`, e.message);
        }
    }

    // 블룸필터 영속화 (매 배치 삽입 후 저장)
    await BloomManager.saveFilter(bloom);

    console.log(`[MiningEngine] ⚡ Optimized Insert: ${totalInserted} new keywords (Row Reads saved: ${uniqueKeywords.length - maybeExisting.length})`);
    return { inserted: totalInserted };
}