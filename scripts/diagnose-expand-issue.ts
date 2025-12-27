/**
 * 시드키워드 확장 문제 진단 스크립트
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function diagnoseExpandIssue() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 시드키워드 확장 문제 진단 중...\n');

        // 1. is_expanded = 2 (Processing) 상태인 키워드 확인
        const processingResult = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 2 AND total_search_cnt >= 1000`,
            args: []
        });
        const processingCount = (processingResult.rows[0]?.count as number) || 0;

        // 2. 최근 1시간 동안 확장 시도한 키워드 (is_expanded = 2로 변경된 것)
        const recentProcessing = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE updated_at > datetime('now', '-1 hour') AND is_expanded = 2`,
            args: []
        });
        const recentProcessingCount = (recentProcessing.rows[0]?.count as number) || 0;

        // 3. 최근 1시간 동안 확장 완료한 키워드 (is_expanded = 1로 변경된 것)
        const recentExpanded = await client.execute({
            sql: `SELECT COUNT(*) as count FROM keywords WHERE updated_at > datetime('now', '-1 hour') AND is_expanded = 1 AND total_search_cnt >= 1000`,
            args: []
        });
        const recentExpandedCount = (recentExpanded.rows[0]?.count as number) || 0;

        // 4. Processing 상태로 남아있는 키워드 샘플
        const processingSample = await client.execute({
            sql: `SELECT keyword, total_search_cnt, updated_at FROM keywords WHERE is_expanded = 2 AND total_search_cnt >= 1000 ORDER BY updated_at DESC LIMIT 10`,
            args: []
        });

        // 5. 확장 가능한 키워드 중 최상위 10개
        const availableSeeds = await client.execute({
            sql: `SELECT keyword, total_search_cnt, created_at FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 1000 ORDER BY total_search_cnt DESC LIMIT 10`,
            args: []
        });

        console.log('─'.repeat(100));
        console.log('📊 확장 상태 진단');
        console.log('─'.repeat(100));
        console.log(`Processing 상태 (is_expanded = 2): ${processingCount.toLocaleString()}개`);
        console.log(`최근 1시간 Processing 시도: ${recentProcessingCount.toLocaleString()}개`);
        console.log(`최근 1시간 확장 완료: ${recentExpandedCount.toLocaleString()}개`);
        console.log('');

        if (processingCount > 0) {
            console.log('⚠️ 경고: Processing 상태로 남아있는 키워드가 있습니다!');
            console.log('   이는 expand 작업이 시작되었지만 완료되지 않았음을 의미합니다.');
            console.log('');
            
            if (processingSample.rows.length > 0) {
                console.log('📋 Processing 상태 키워드 샘플:');
                console.log('─'.repeat(100));
                processingSample.rows.forEach((row, idx) => {
                    const keyword = row.keyword as string;
                    const totalSearch = row.total_search_cnt as number;
                    const updatedAt = row.updated_at as string;
                    const updatedDate = updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'N/A';
                    console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 업데이트: ${updatedDate}`);
                });
                console.log('');
            }
        }

        if (recentProcessingCount > 0 && recentExpandedCount === 0) {
            console.log('❌ 문제 발견: Processing 시도는 있었지만 확장 완료가 없습니다!');
            console.log('   가능한 원인:');
            console.log('   1. API 키 문제로 expand가 실패');
            console.log('   2. processSeedKeyword 함수에서 에러 발생');
            console.log('   3. 자동수집 API가 타임아웃으로 중단');
            console.log('');
        }

        if (recentProcessingCount === 0) {
            console.log('❌ 문제 발견: 최근 1시간 동안 expand 작업이 실행되지 않았습니다!');
            console.log('   가능한 원인:');
            console.log('   1. 자동수집 API가 호출되지 않음');
            console.log('   2. Vercel Cron 또는 GitHub Actions가 실행되지 않음');
            console.log('   3. task=expand 파라미터가 제대로 전달되지 않음');
            console.log('');
        }

        if (availableSeeds.rows.length > 0) {
            console.log('📋 확장 가능한 키워드 샘플 (상위 10개):');
            console.log('─'.repeat(100));
            availableSeeds.rows.forEach((row, idx) => {
                const keyword = row.keyword as string;
                const totalSearch = row.total_search_cnt as number;
                const createdAt = row.created_at as string;
                const createdDate = createdAt ? new Date(createdAt).toLocaleString('ko-KR') : 'N/A';
                console.log(`  ${idx + 1}. ${keyword} (${totalSearch.toLocaleString()}) - 생성: ${createdDate}`);
            });
            console.log('');
        }

        // 권장사항
        console.log('─'.repeat(100));
        console.log('💡 권장사항');
        console.log('─'.repeat(100));
        
        if (processingCount > 100) {
            console.log('1. Processing 상태로 남아있는 키워드가 많습니다.');
            console.log('   → 이 키워드들을 is_expanded = 0으로 리셋하여 재시도하세요.');
            console.log('   → 스크립트: npx tsx scripts/reset-processing-keywords.ts');
            console.log('');
        }

        if (recentProcessingCount === 0) {
            console.log('1. 자동수집 API가 실행되지 않고 있습니다.');
            console.log('   → Vercel 대시보드에서 Cron 작업 상태를 확인하세요.');
            console.log('   → GitHub Actions에서 워크플로우 실행 상태를 확인하세요.');
            console.log('');
        }

        if (recentProcessingCount > 0 && recentExpandedCount === 0) {
            console.log('1. Expand 작업이 실행되지만 실패하고 있습니다.');
            console.log('   → Vercel 로그에서 에러 메시지를 확인하세요.');
            console.log('   → API 키 상태를 확인하세요.');
            console.log('');
        }

    } catch (error: any) {
        console.error('❌ 오류 발생:', error.message);
        console.error('상세:', error);
        process.exit(1);
    }
}

diagnoseExpandIssue();

