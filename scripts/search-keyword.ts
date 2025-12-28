/**
 * Turso 데이터베이스에서 키워드 검색 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/search-keyword.ts "검색어"
 *   npx tsx scripts/search-keyword.ts "일본여행" --exact
 *   npx tsx scripts/search-keyword.ts "디즈니" --limit 20
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

interface SearchOptions {
    keyword: string;
    exact?: boolean;
    limit?: number;
}

async function searchKeyword(options: SearchOptions) {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    if (!options.keyword) {
        console.error('❌ 검색어를 입력해주세요.');
        console.log('\n사용법:');
        console.log('  npx tsx scripts/search-keyword.ts "검색어"');
        console.log('  npx tsx scripts/search-keyword.ts "일본여행" --exact');
        console.log('  npx tsx scripts/search-keyword.ts "디즈니" --limit 20');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        const { keyword, exact = false, limit = 50 } = options;

        console.log(`🔍 키워드 검색: "${keyword}"`);
        console.log(`   - 검색 방식: ${exact ? '정확 일치' : '부분 일치'}`);
        console.log(`   - 결과 제한: ${limit}개\n`);

        let sql: string;
        let args: any[];

        if (exact) {
            // 정확 일치 검색
            sql = `
                SELECT 
                    keyword,
                    total_search_cnt,
                    pc_search_cnt,
                    mo_search_cnt,
                    total_doc_cnt,
                    blog_doc_cnt,
                    cafe_doc_cnt,
                    web_doc_cnt,
                    news_doc_cnt,
                    tier,
                    is_expanded,
                    created_at,
                    updated_at
                FROM keywords
                WHERE keyword = ?
                LIMIT ?
            `;
            args = [keyword, limit];
        } else {
            // 부분 일치 검색 (LIKE 사용)
            sql = `
                SELECT 
                    keyword,
                    total_search_cnt,
                    pc_search_cnt,
                    mo_search_cnt,
                    total_doc_cnt,
                    blog_doc_cnt,
                    cafe_doc_cnt,
                    web_doc_cnt,
                    news_doc_cnt,
                    tier,
                    is_expanded,
                    created_at,
                    updated_at
                FROM keywords
                WHERE keyword LIKE ?
                ORDER BY total_search_cnt DESC
                LIMIT ?
            `;
            args = [`%${keyword}%`, limit];
        }

        const result = await client.execute({
            sql,
            args,
        });

        if (result.rows.length === 0) {
            console.log(`❌ 검색 결과가 없습니다.`);
            console.log(`\n💡 다른 검색어로 시도해보세요:`);
            console.log(`   - 부분 일치: npx tsx scripts/search-keyword.ts "${keyword}"`);
            console.log(`   - 정확 일치: npx tsx scripts/search-keyword.ts "${keyword}" --exact`);
            return;
        }

        console.log(`✅ 검색 결과: ${result.rows.length}개\n`);
        console.log('─'.repeat(150));
        console.log(
            '순번'.padEnd(5) +
            '키워드'.padEnd(30) +
            '총검색량'.padEnd(12) +
            'PC'.padEnd(10) +
            'Mobile'.padEnd(10) +
            '문서수'.padEnd(12) +
            '등급'.padEnd(12) +
            '확장'.padEnd(8) +
            '등록일시'
        );
        console.log('─'.repeat(150));

        result.rows.forEach((row, idx) => {
            const kw = (row.keyword as string) || '';
            const totalSearch = (row.total_search_cnt as number) || 0;
            const pcSearch = (row.pc_search_cnt as number) || 0;
            const moSearch = (row.mo_search_cnt as number) || 0;
            const totalDoc = (row.total_doc_cnt as number) || 0;
            const tier = (row.tier as string) || 'UNRANKED';
            const isExpanded = (row.is_expanded as number) || 0;
            const createdAt = (row.created_at as string) || '';
            
            const expandedStatus = isExpanded === 1 ? '완료' : isExpanded === 2 ? '실패' : '미확장';
            const formattedDate = createdAt 
                ? new Date(createdAt).toLocaleString('ko-KR', { 
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
                : 'N/A';

            console.log(
                `${(idx + 1).toString().padEnd(5)}` +
                `${kw.substring(0, 29).padEnd(30)}` +
                `${totalSearch.toLocaleString().padEnd(12)}` +
                `${pcSearch.toLocaleString().padEnd(10)}` +
                `${moSearch.toLocaleString().padEnd(10)}` +
                `${totalDoc > 0 ? totalDoc.toLocaleString() : 'N/A'}`.padEnd(12) +
                `${tier.padEnd(12)}` +
                `${expandedStatus.padEnd(8)}` +
                `${formattedDate}`
            );
        });

        console.log('─'.repeat(150));
        console.log('');

        // 통계 정보
        if (!exact) {
            const statsResult = await client.execute({
                sql: `
                    SELECT 
                        COUNT(*) as total,
                        SUM(total_search_cnt) as total_search_sum,
                        AVG(total_search_cnt) as avg_search,
                        COUNT(CASE WHEN total_doc_cnt IS NOT NULL THEN 1 END) as with_docs,
                        COUNT(CASE WHEN is_expanded = 1 THEN 1 END) as expanded
                    FROM keywords
                    WHERE keyword LIKE ?
                `,
                args: [`%${keyword}%`],
            });

            const stats = statsResult.rows[0];
            const total = (stats?.total as number) || 0;
            const totalSearchSum = (stats?.total_search_sum as number) || 0;
            const avgSearch = (stats?.avg_search as number) || 0;
            const withDocs = (stats?.with_docs as number) || 0;
            const expanded = (stats?.expanded as number) || 0;

            console.log('📊 검색 결과 통계:');
            console.log(`   - 총 키워드 수: ${total.toLocaleString()}개`);
            console.log(`   - 총 검색량 합계: ${totalSearchSum.toLocaleString()}`);
            console.log(`   - 평균 검색량: ${Math.round(avgSearch).toLocaleString()}`);
            console.log(`   - 문서수 수집 완료: ${withDocs.toLocaleString()}개`);
            console.log(`   - 확장 완료: ${expanded.toLocaleString()}개`);
            console.log('');
        }

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const keywordArg = args.find(arg => !arg.startsWith('--'));
const exactFlag = args.includes('--exact');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

if (!keywordArg) {
    console.error('❌ 검색어를 입력해주세요.');
    console.log('\n사용법:');
    console.log('  npx tsx scripts/search-keyword.ts "검색어"');
    console.log('  npx tsx scripts/search-keyword.ts "일본여행" --exact');
    console.log('  npx tsx scripts/search-keyword.ts "디즈니" --limit 20');
    process.exit(1);
}

searchKeyword({
    keyword: keywordArg,
    exact: exactFlag,
    limit: limit,
});

