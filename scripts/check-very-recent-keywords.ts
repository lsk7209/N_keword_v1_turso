/**
 * 최근 몇 분 내 생성된 키워드 확인 (더 정확한 검증)
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkVeryRecentKeywords() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 최근 생성된 키워드 확인 중...\n');

        // 최근 5분, 10분, 30분 내 생성된 키워드 확인
        const timeRanges = [
            { label: '최근 5분', minutes: 5 },
            { label: '최근 10분', minutes: 10 },
            { label: '최근 30분', minutes: 30 }
        ];

        for (const range of timeRanges) {
            const result = await client.execute({
                sql: `SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt, created_at 
                      FROM keywords 
                      WHERE created_at >= datetime('now', '-${range.minutes} minutes')
                      ORDER BY created_at DESC`,
                args: []
            });

            console.log(`📊 ${range.label} 내 생성된 키워드: ${result.rows.length}개`);
            if (result.rows.length > 0) {
                result.rows.forEach((row, idx) => {
                    const keyword = row.keyword as string;
                    const totalSearch = row.total_search_cnt as number;
                    const pcSearch = row.pc_search_cnt as number;
                    const moSearch = row.mo_search_cnt as number;
                    const createdAt = row.created_at as string;
                    const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                    console.log(`   ${idx + 1}. ${keyword}`);
                    console.log(`      검색량: ${totalSearch.toLocaleString()} (PC: ${pcSearch.toLocaleString()}, Mobile: ${moSearch.toLocaleString()})`);
                    console.log(`      생성일시: ${createdDate}`);
                });
            } else {
                console.log('   없음');
            }
            console.log('');
        }

        // "디즈니" 관련 키워드 중 최근 생성된 것 확인
        console.log('🔍 최근 30분 내 "디즈니" 관련 키워드:');
        const disneyResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at 
                  FROM keywords 
                  WHERE keyword LIKE '%디즈니%' 
                  AND created_at >= datetime('now', '-30 minutes')
                  ORDER BY created_at DESC`,
            args: []
        });

        if (disneyResult.rows.length > 0) {
            console.log(`   총 ${disneyResult.rows.length}개 발견:`);
            disneyResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`   ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - ${createdDate}`);
            });
        } else {
            console.log('   최근 30분 내 생성된 "디즈니" 관련 키워드가 없습니다.');
        }
        console.log('');

        // 현재 시간 출력
        const now = new Date();
        console.log(`⏰ 현재 시간: ${now.toLocaleString('ko-KR')}`);
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkVeryRecentKeywords();

