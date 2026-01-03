
import { getTursoClient } from '../src/utils/turso';
import { BloomManager } from '../src/utils/bloom-manager';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function initializeBloomFilter() {
    console.log('🚀 Bloom Filter 초기화 시작...');
    const startTime = Date.now();

    const db = getTursoClient();

    // 1. 모든 기존 키워드 가져오기
    const result = await db.execute('SELECT keyword FROM keywords');
    const keywords = result.rows.map(r => String(r.keyword));
    console.log(`📊 기존 키워드 수: ${keywords.length}개`);

    // 2. Bloom Filter에 추가
    const filter = await BloomManager.getFilter();
    let added = 0;
    for (const kw of keywords) {
        filter.add(kw);
        added++;
    }
    console.log(`✅ Bloom Filter에 ${added}개 키워드 학습 완료`);

    // 3. DB에 저장
    await BloomManager.saveFilter(filter);

    const elapsed = Date.now() - startTime;
    console.log(`🎉 초기화 완료! (소요 시간: ${elapsed}ms)`);

    // 4. 테스트
    const testKeyword = keywords[0];
    const exists = filter.has(testKeyword);
    console.log(`\n🧪 테스트: "${testKeyword}" 존재 여부 = ${exists ? '있음 ✅' : '없음 ❌'}`);

    const fakeKeyword = '이건절대없는키워드12345';
    const fakeExists = filter.has(fakeKeyword);
    console.log(`🧪 테스트: "${fakeKeyword}" 존재 여부 = ${fakeExists ? '있음 (False Positive)' : '없음 ✅'}`);
}

initializeBloomFilter().catch(console.error);
