import { getTursoClient } from '@/utils/turso';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkStatus() {
    const db = getTursoClient();

    console.log('=== 📊 수집 상태 확인 ===\n');

    // 1. 키워드 수집 상태
    const last5min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-5 minutes")');
    const last15min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-15 minutes")');
    const last30min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE created_at > datetime("now", "-30 minutes")');

    console.log('🔍 키워드 수집 (EXPAND):');
    console.log('  최근 5분:  ', last5min.rows[0].c, '개');
    console.log('  최근 15분: ', last15min.rows[0].c, '개');
    console.log('  최근 30분: ', last30min.rows[0].c, '개');

    // 2. 문서 수 수집 상태
    const docsLast5min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime("now", "-5 minutes")');
    const docsLast15min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime("now", "-15 minutes")');
    const docsLast30min = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL AND updated_at > datetime("now", "-30 minutes")');

    console.log('\n📄 문서 수 수집 (FILL_DOCS):');
    console.log('  최근 5분:  ', docsLast5min.rows[0].c, '개');
    console.log('  최근 15분: ', docsLast15min.rows[0].c, '개');
    console.log('  최근 30분: ', docsLast30min.rows[0].c, '개');

    // 3. 진행 중인 작업
    const processing = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 2');
    const docProcessing = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt = -2');

    console.log('\n⏳ 진행 중:');
    console.log('  확장 중:   ', processing.rows[0].c, '개');
    console.log('  문서수 중: ', docProcessing.rows[0].c, '개');

    // 4. 대기 중
    const pending = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE is_expanded = 0 AND total_search_cnt >= 50');
    const docPending = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NULL');

    console.log('\n📋 대기 중:');
    console.log('  확장 대기: ', pending.rows[0].c, '개');
    console.log('  문서수 대기:', docPending.rows[0].c, '개');

    // 5. 총계
    const total = await db.execute('SELECT COUNT(*) as c FROM keywords');
    const analyzed = await db.execute('SELECT COUNT(*) as c FROM keywords WHERE total_doc_cnt IS NOT NULL');

    console.log('\n📈 총계:');
    console.log('  전체 키워드:', total.rows[0].c, '개');
    console.log('  분석 완료:  ', analyzed.rows[0].c, '개 (' + Math.round((analyzed.rows[0].c as number) / (total.rows[0].c as number) * 100) + '%)');

    // 6. 판정
    const keywordGrowth = (last5min.rows[0].c as number) > 0;
    const docsGrowth = (docsLast5min.rows[0].c as number) > 0;

    console.log('\n🎯 상태 판정:');
    console.log('  키워드 수집:', keywordGrowth ? '✅ 정상 작동' : '❌ 중단됨');
    console.log('  문서 수 수집:', docsGrowth ? '✅ 정상 작동' : '❌ 중단됨');
}

checkStatus();
