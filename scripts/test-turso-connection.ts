/**
 * Turso 데이터베이스 연결 테스트 스크립트
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { resolve } from 'path';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// 환경 변수에서 가져오기
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function testConnection() {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)가 설정되지 않았습니다.');
        process.exit(1);
    }
    console.log('🔍 Turso 데이터베이스 연결 테스트 시작...\n');
    console.log(`📡 URL: ${TURSO_DATABASE_URL}`);
    console.log(`🔑 Token: ${TURSO_AUTH_TOKEN.substring(0, 10)}... (Length: ${TURSO_AUTH_TOKEN.length})\n`);

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        // 1. 기본 연결 테스트
        console.log('1️⃣ 기본 연결 테스트...');
        const testResult = await client.execute('SELECT 1 as test');
        console.log('✅ 연결 성공!\n');

        // 2. 테이블 존재 확인
        console.log('2️⃣ 테이블 존재 확인...');
        const tablesResult = await client.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        const tables = tablesResult.rows.map(row => row.name as string);
        console.log(`✅ 발견된 테이블: ${tables.join(', ') || '없음'}\n`);

        // 3. keywords 테이블 확인
        if (tables.includes('keywords')) {
            console.log('3️⃣ keywords 테이블 확인...');
            const countResult = await client.execute('SELECT COUNT(*) as count FROM keywords');
            const count = countResult.rows[0]?.count as number || 0;
            console.log(`✅ keywords 테이블에 ${count.toLocaleString()}개의 레코드가 있습니다.\n`);

            // 최근 키워드 샘플
            const sampleResult = await client.execute(`
                SELECT keyword, total_search_cnt, created_at 
                FROM keywords 
                ORDER BY created_at DESC 
                LIMIT 5
            `);
            if (sampleResult.rows.length > 0) {
                console.log('📋 최근 키워드 샘플:');
                sampleResult.rows.forEach((row, idx) => {
                    console.log(`   ${idx + 1}. ${row.keyword} (검색량: ${row.total_search_cnt})`);
                });
                console.log('');
            }
        } else {
            console.log('⚠️ keywords 테이블이 존재하지 않습니다.\n');
        }

        // 4. settings 테이블 확인
        if (tables.includes('settings')) {
            console.log('4️⃣ settings 테이블 확인...');
            const settingsResult = await client.execute('SELECT key, value FROM settings');
            console.log(`✅ settings 테이블에 ${settingsResult.rows.length}개의 설정이 있습니다.`);
            if (settingsResult.rows.length > 0) {
                settingsResult.rows.forEach(row => {
                    console.log(`   - ${row.key}: ${row.value}`);
                });
            }
            console.log('');
        }

        // 5. 인덱스 확인
        console.log('5️⃣ 인덱스 확인...');
        const indexesResult = await client.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='index' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        const indexes = indexesResult.rows.map(row => row.name as string);
        console.log(`✅ 발견된 인덱스: ${indexes.length}개`);
        if (indexes.length > 0) {
            indexes.forEach(idx => console.log(`   - ${idx}`));
        }
        console.log('');

        // 6. 스키마 확인 (keywords 테이블)
        if (tables.includes('keywords')) {
            console.log('6️⃣ keywords 테이블 스키마 확인...');
            const schemaResult = await client.execute('PRAGMA table_info(keywords)');
            console.log('✅ 컬럼 정보:');
            schemaResult.rows.forEach((row: any) => {
                console.log(`   - ${row.name} (${row.type})${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ''}`);
            });
            console.log('');
        }

        console.log('🎉 모든 테스트 완료! Turso 데이터베이스가 정상적으로 연동되어 있습니다.\n');

    } catch (error: any) {
        console.error('❌ 연결 실패:', error.message);
        console.error('상세 에러:', error);
        process.exit(1);
    }
}

testConnection();

