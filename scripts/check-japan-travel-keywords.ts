/**
 * "일본여행" 관련 키워드가 DB에 저장되었는지 확인
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkJapanTravelKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 "일본여행" 관련 키워드 확인 중...\n');

        // 화면에 표시된 키워드들 확인
        const keywordsToCheck = [
            '일본',
            '일본여행',
            '부산가볼만한곳',
            '훗카이도',
            '온천여행',
            '크루즈여행',
            '후쿠오카호텔',
            '홋카이도',
            '부산놀거리'
        ];

        console.log('📋 확인할 키워드 목록:');
        keywordsToCheck.forEach((kw, idx) => {
            console.log(`   ${idx + 1}. ${kw}`);
        });
        console.log('');

        // 각 키워드가 DB에 있는지 확인
        const foundKeywords: any[] = [];
        const notFoundKeywords: string[] = [];

        for (const keyword of keywordsToCheck) {
            const result = await client.execute({
                sql: 'SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt, created_at, updated_at FROM keywords WHERE keyword = ?',
                args: [keyword]
            });

            if (result.rows.length > 0) {
                foundKeywords.push(result.rows[0]);
            } else {
                notFoundKeywords.push(keyword);
            }
        }

        console.log('─'.repeat(100));
        console.log('✅ DB에 저장된 키워드:');
        if (foundKeywords.length > 0) {
            foundKeywords.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const pcSearch = row.pc_search_cnt as number;
                const moSearch = row.mo_search_cnt as number;
                const createdAt = row.created_at as string;
                const updatedAt = row.updated_at as string;
                
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';

                console.log(`\n${idx + 1}. ${keyword}`);
                console.log(`   - 총 검색량: ${totalSearch.toLocaleString()}`);
                console.log(`   - PC: ${pcSearch.toLocaleString()}, Mobile: ${moSearch.toLocaleString()}`);
                console.log(`   - 생성일시: ${createdDate}`);
                console.log(`   - 수정일시: ${updatedDate}`);
            });
        } else {
            console.log('   없음');
        }

        console.log('\n─'.repeat(100));
        console.log('❌ DB에 없는 키워드:');
        if (notFoundKeywords.length > 0) {
            notFoundKeywords.forEach((kw, idx) => {
                console.log(`   ${idx + 1}. ${kw}`);
            });
        } else {
            console.log('   없음 (모든 키워드가 저장되어 있습니다)');
        }

        console.log('\n─'.repeat(100));
        console.log(`📊 요약: ${foundKeywords.length}개 저장됨 / ${notFoundKeywords.length}개 누락됨`);

        // 최근 1시간 내에 생성된 "일본" 관련 키워드 확인
        console.log('\n🔍 최근 1시간 내 생성된 "일본" 관련 키워드:');
        const recentResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at 
                  FROM keywords 
                  WHERE keyword LIKE '%일본%' 
                  AND created_at >= datetime('now', '-1 hour')
                  ORDER BY created_at DESC
                  LIMIT 20`,
            args: []
        });

        if (recentResult.rows.length > 0) {
            console.log(`   총 ${recentResult.rows.length}개 발견:`);
            recentResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`   ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - ${createdDate}`);
            });
        } else {
            console.log('   최근 1시간 내 생성된 키워드가 없습니다.');
        }

        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkJapanTravelKeywords();

