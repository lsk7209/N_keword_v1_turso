/**
 * Turso DB에서 키워드 검색 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/search-keywords.ts "검색어"
 *   npx tsx scripts/search-keywords.ts "허리통증"
 *   npx tsx scripts/search-keywords.ts "디즈니" --limit 20
 *   npx tsx scripts/search-keywords.ts "" --recent 10  // 최근 10개
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function searchKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        // 명령줄 인자 파싱
        const args = process.argv.slice(2);
        let searchTerm = '';
        let limit = 50;
        let recent = 0;
        let minSearchVolume = 0;
        let orderBy = 'total_search_cnt'; // 'total_search_cnt', 'created_at', 'updated_at'

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--limit' && args[i + 1]) {
                limit = parseInt(args[i + 1], 10);
                i++;
            } else if (args[i] === '--recent' && args[i + 1]) {
                recent = parseInt(args[i + 1], 10);
                i++;
            } else if (args[i] === '--min-volume' && args[i + 1]) {
                minSearchVolume = parseInt(args[i + 1], 10);
                i++;
            } else if (args[i] === '--order-by' && args[i + 1]) {
                orderBy = args[i + 1];
                i++;
            } else if (!args[i].startsWith('--')) {
                searchTerm = args[i];
            }
        }

        console.log('🔍 Turso DB 키워드 검색\n');
        console.log(`검색어: ${searchTerm || '(전체)'}`);
        console.log(`제한: ${limit}개`);
        if (recent > 0) {
            console.log(`최근: ${recent}분 내`);
        }
        if (minSearchVolume > 0) {
            console.log(`최소 검색량: ${minSearchVolume.toLocaleString()}`);
        }
        console.log(`정렬: ${orderBy}`);
        console.log('─'.repeat(100));
        console.log('');

        let result;

        if (recent > 0) {
            // 최근 N분 내 생성된 키워드
            result = await client.execute({
                sql: `SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt, 
                             blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, news_doc_cnt,
                             created_at, updated_at
                      FROM keywords 
                      WHERE created_at >= datetime('now', '-${recent} minutes')
                      ${minSearchVolume > 0 ? `AND total_search_cnt >= ${minSearchVolume}` : ''}
                      ORDER BY ${orderBy} DESC
                      LIMIT ${limit}`,
                args: []
            });
        } else if (searchTerm) {
            // 키워드 검색 (LIKE 패턴)
            const searchPattern = `%${searchTerm}%`;
            result = await client.execute({
                sql: `SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                             blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, news_doc_cnt,
                             created_at, updated_at
                      FROM keywords 
                      WHERE keyword LIKE ?
                      ${minSearchVolume > 0 ? `AND total_search_cnt >= ${minSearchVolume}` : ''}
                      ORDER BY ${orderBy} DESC
                      LIMIT ${limit}`,
                args: [searchPattern]
            });
        } else {
            // 전체 조회
            result = await client.execute({
                sql: `SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                             blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, news_doc_cnt,
                             created_at, updated_at
                      FROM keywords 
                      ${minSearchVolume > 0 ? `WHERE total_search_cnt >= ${minSearchVolume}` : ''}
                      ORDER BY ${orderBy} DESC
                      LIMIT ${limit}`,
                args: []
            });
        }

        if (result.rows.length === 0) {
            console.log('❌ 검색 결과가 없습니다.');
            return;
        }

        console.log(`✅ 검색 결과: ${result.rows.length}개\n`);

        result.rows.forEach((row, idx) => {
            const keyword = row.keyword as string;
            const totalSearch = row.total_search_cnt as number;
            const pcSearch = row.pc_search_cnt as number;
            const moSearch = row.mo_search_cnt as number;
            const blogDoc = row.blog_doc_cnt as number;
            const cafeDoc = row.cafe_doc_cnt as number;
            const webDoc = row.web_doc_cnt as number;
            const newsDoc = row.news_doc_cnt as number;
            const createdAt = row.created_at as string;
            const updatedAt = row.updated_at as string;

            const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
            const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';

            console.log(`${idx + 1}. ${keyword}`);
            console.log(`   검색량: ${totalSearch.toLocaleString()} (PC: ${pcSearch.toLocaleString()}, Mobile: ${moSearch.toLocaleString()})`);
            
            if (blogDoc || cafeDoc || webDoc || newsDoc) {
                const docCounts = [];
                if (blogDoc) docCounts.push(`블로그: ${blogDoc.toLocaleString()}`);
                if (cafeDoc) docCounts.push(`카페: ${cafeDoc.toLocaleString()}`);
                if (webDoc) docCounts.push(`웹: ${webDoc.toLocaleString()}`);
                if (newsDoc) docCounts.push(`뉴스: ${newsDoc.toLocaleString()}`);
                console.log(`   문서수: ${docCounts.join(', ')}`);
            }
            
            console.log(`   생성일시: ${createdDate}`);
            if (updatedAt && updatedAt !== createdAt) {
                console.log(`   수정일시: ${updatedDate}`);
            }
            console.log('');
        });

        console.log('─'.repeat(100));
        console.log(`총 ${result.rows.length}개 결과`);

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

// 사용법 안내
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Turso DB 키워드 검색 스크립트

사용법:
  npx tsx scripts/search-keywords.ts [검색어] [옵션]

예시:
  # 특정 키워드 검색
  npx tsx scripts/search-keywords.ts "허리통증"
  
  # 키워드 포함 검색 (부분 일치)
  npx tsx scripts/search-keywords.ts "디즈니"
  
  # 최근 10분 내 생성된 키워드
  npx tsx scripts/search-keywords.ts "" --recent 10
  
  # 검색량 상위 20개
  npx tsx scripts/search-keywords.ts "" --limit 20
  
  # 최소 검색량 10,000 이상
  npx tsx scripts/search-keywords.ts "" --min-volume 10000
  
  # 생성일시 기준 정렬
  npx tsx scripts/search-keywords.ts "" --order-by created_at
  
  # 조합 예시
  npx tsx scripts/search-keywords.ts "통증" --limit 30 --min-volume 5000

옵션:
  --limit N          결과 개수 제한 (기본값: 50)
  --recent N         최근 N분 내 생성된 키워드만 검색
  --min-volume N     최소 검색량 필터
  --order-by FIELD   정렬 기준 (total_search_cnt, created_at, updated_at)
  --help, -h         도움말 표시
`);
    process.exit(0);
}

searchKeywords();

