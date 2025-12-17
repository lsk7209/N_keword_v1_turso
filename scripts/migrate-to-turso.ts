/**
 * Supabase에서 Turso로 데이터 마이그레이션 스크립트
 * 
 * 사용법:
 * 1. Supabase와 Turso 환경 변수 설정
 * 2. npm run migrate:to-turso
 * 
 * 또는 직접 실행:
 * npx tsx scripts/migrate-to-turso.ts
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createTursoClient } from '@libsql/client';
import { generateUUID } from '../src/utils/turso';

// 환경 변수 확인
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
    console.error('필요한 변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

if (!tursoUrl || !tursoToken) {
    console.error('❌ Turso 환경 변수가 설정되지 않았습니다.');
    console.error('필요한 변수: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN');
    process.exit(1);
}

const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
const turso = createTursoClient({
    url: tursoUrl,
    authToken: tursoToken,
});

async function migrateKeywords() {
    console.log('🔄 키워드 데이터 마이그레이션 시작...');

    let offset = 0;
    const batchSize = 1000;
    let totalMigrated = 0;

    while (true) {
        // Supabase에서 데이터 가져오기
        const { data, error } = await supabase
            .from('keywords')
            .select('*')
            .range(offset, offset + batchSize - 1)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ Supabase 데이터 조회 오류:', error);
            break;
        }

        if (!data || data.length === 0) {
            console.log('✅ 모든 데이터 마이그레이션 완료');
            break;
        }

        console.log(`📦 배치 ${offset + 1}~${offset + data.length} 처리 중...`);

        // Turso에 삽입
        for (const row of data) {
            try {
                // 키워드가 이미 존재하는지 확인
                const existing = await turso.execute({
                    sql: 'SELECT id FROM keywords WHERE keyword = ?',
                    args: [row.keyword]
                });

                if (existing.rows.length > 0) {
                    // 업데이트
                    await turso.execute({
                        sql: `UPDATE keywords SET 
                            total_search_cnt = ?, pc_search_cnt = ?, mo_search_cnt = ?,
                            click_cnt = ?, pc_click_cnt = ?, mo_click_cnt = ?,
                            total_ctr = ?, pc_ctr = ?, mo_ctr = ?, ctr = ?,
                            comp_idx = ?, pl_avg_depth = ?, avg_bid_price = ?,
                            total_doc_cnt = ?, blog_doc_cnt = ?, cafe_doc_cnt = ?,
                            web_doc_cnt = ?, news_doc_cnt = ?,
                            tier = ?, golden_ratio = ?, is_expanded = ?,
                            created_at = ?, updated_at = ?
                            WHERE keyword = ?`,
                        args: [
                            row.total_search_cnt || 0,
                            row.pc_search_cnt || 0,
                            row.mo_search_cnt || 0,
                            row.click_cnt || 0,
                            row.pc_click_cnt || 0,
                            row.mo_click_cnt || 0,
                            row.total_ctr || row.ctr || 0,
                            row.pc_ctr || 0,
                            row.mo_ctr || 0,
                            row.ctr || 0,
                            row.comp_idx || null,
                            row.pl_avg_depth || 0,
                            row.avg_bid_price || 0,
                            row.total_doc_cnt,
                            row.blog_doc_cnt || 0,
                            row.cafe_doc_cnt || 0,
                            row.web_doc_cnt || 0,
                            row.news_doc_cnt || 0,
                            row.tier || 'UNRANKED',
                            row.golden_ratio || 0,
                            row.is_expanded ? 1 : 0,
                            row.created_at || new Date().toISOString(),
                            row.updated_at || new Date().toISOString(),
                            row.keyword
                        ]
                    });
                } else {
                    // 새로 삽입
                    const id = generateUUID();
                    await turso.execute({
                        sql: `INSERT INTO keywords (
                            id, keyword, total_search_cnt, pc_search_cnt, mo_search_cnt,
                            click_cnt, pc_click_cnt, mo_click_cnt,
                            total_ctr, pc_ctr, mo_ctr, ctr,
                            comp_idx, pl_avg_depth, avg_bid_price,
                            total_doc_cnt, blog_doc_cnt, cafe_doc_cnt, web_doc_cnt, news_doc_cnt,
                            tier, golden_ratio, is_expanded, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            id,
                            row.keyword,
                            row.total_search_cnt || 0,
                            row.pc_search_cnt || 0,
                            row.mo_search_cnt || 0,
                            row.click_cnt || 0,
                            row.pc_click_cnt || 0,
                            row.mo_click_cnt || 0,
                            row.total_ctr || row.ctr || 0,
                            row.pc_ctr || 0,
                            row.mo_ctr || 0,
                            row.ctr || 0,
                            row.comp_idx || null,
                            row.pl_avg_depth || 0,
                            row.avg_bid_price || 0,
                            row.total_doc_cnt,
                            row.blog_doc_cnt || 0,
                            row.cafe_doc_cnt || 0,
                            row.web_doc_cnt || 0,
                            row.news_doc_cnt || 0,
                            row.tier || 'UNRANKED',
                            row.golden_ratio || 0,
                            row.is_expanded ? 1 : 0,
                            row.created_at || new Date().toISOString(),
                            row.updated_at || new Date().toISOString()
                        ]
                    });
                }
                totalMigrated++;
            } catch (e: any) {
                console.error(`❌ 키워드 "${row.keyword}" 마이그레이션 실패:`, e.message);
            }
        }

        offset += batchSize;

        if (data.length < batchSize) {
            break;
        }
    }

    console.log(`✅ 총 ${totalMigrated}개 키워드 마이그레이션 완료`);
    return totalMigrated;
}

async function migrateSettings() {
    console.log('🔄 설정 데이터 마이그레이션 시작...');

    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*');

        if (error) {
            console.error('❌ Supabase 설정 조회 오류:', error);
            return;
        }

        if (!data || data.length === 0) {
            console.log('ℹ️  마이그레이션할 설정이 없습니다.');
            return;
        }

        for (const setting of data) {
            try {
                await turso.execute({
                    sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
                    args: [
                        setting.key,
                        typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value),
                        setting.updated_at || new Date().toISOString()
                    ]
                });
                console.log(`✅ 설정 "${setting.key}" 마이그레이션 완료`);
            } catch (e: any) {
                console.error(`❌ 설정 "${setting.key}" 마이그레이션 실패:`, e.message);
            }
        }
    } catch (e: any) {
        console.error('❌ 설정 마이그레이션 오류:', e);
    }
}

async function main() {
    console.log('🚀 Supabase → Turso 마이그레이션 시작\n');

    try {
        // Turso 스키마 확인 (keywords 테이블 존재 여부)
        const schemaCheck = await turso.execute({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='keywords'"
        });

        if (schemaCheck.rows.length === 0) {
            console.error('❌ Turso 데이터베이스에 keywords 테이블이 없습니다.');
            console.error('먼저 turso/schema.sql을 실행하여 스키마를 생성하세요.');
            process.exit(1);
        }

        // 키워드 마이그레이션
        await migrateKeywords();

        // 설정 마이그레이션
        await migrateSettings();

        console.log('\n✅ 마이그레이션 완료!');
    } catch (e: any) {
        console.error('❌ 마이그레이션 중 오류 발생:', e);
        process.exit(1);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

export { main as migrateToTurso };

