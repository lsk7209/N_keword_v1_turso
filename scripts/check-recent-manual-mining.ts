/**
 * 최근 수동 수집으로 저장된 키워드 확인
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function checkRecentManualMining() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 최근 수동 수집 키워드 확인 중...\n');

        // 최근 10분, 30분, 1시간 내 생성된 키워드 확인
        const timeRanges = [
            { label: '최근 10분', hours: 10/60 },
            { label: '최근 30분', hours: 30/60 },
            { label: '최근 1시간', hours: 1 },
            { label: '최근 3시간', hours: 3 }
        ];

        for (const range of timeRanges) {
            const result = await client.execute({
                sql: `SELECT keyword, total_search_cnt, pc_search_cnt, mo_search_cnt, created_at 
                      FROM keywords 
                      WHERE created_at >= datetime('now', '-${range.hours} hours')
                      ORDER BY created_at DESC
                      LIMIT 20`,
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
                    console.log(`   ${idx + 1}. ${keyword} (총: ${totalSearch.toLocaleString()}, PC: ${pcSearch.toLocaleString()}, Mobile: ${moSearch.toLocaleString()}) - ${createdDate}`);
                });
            } else {
                console.log('   없음');
            }
            console.log('');
        }

        // "일본여행"으로 수집된 것으로 보이는 키워드들 확인 (최근 3시간)
        console.log('🔍 최근 3시간 내 "일본" 관련 키워드:');
        const japanResult = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at 
                  FROM keywords 
                  WHERE keyword LIKE '%일본%' 
                  AND created_at >= datetime('now', '-3 hours')
                  ORDER BY created_at DESC`,
            args: []
        });

        if (japanResult.rows.length > 0) {
            console.log(`   총 ${japanResult.rows.length}개 발견:`);
            japanResult.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`   ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - ${createdDate}`);
            });
        } else {
            console.log('   최근 3시간 내 생성된 "일본" 관련 키워드가 없습니다.');
        }

        console.log('\n💡 분석:');
        console.log('   - 화면에 표시된 키워드들은 이미 이전에 저장되어 있었습니다.');
        console.log('   - 수동 수집이 실행되었지만, 중복 키워드라서 새로 저장되지 않았을 가능성이 높습니다.');
        console.log('   - INSERT OR IGNORE로 인해 이미 존재하는 키워드는 무시됩니다.');
        console.log('');

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

checkRecentManualMining();

