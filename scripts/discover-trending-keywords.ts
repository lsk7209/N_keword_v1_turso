/**
 * 인기 검색어지만 아직 수집하지 못한 키워드 발굴 스크립트
 * 
 * 전략:
 * 1. 네이버 실시간 검색어 (RSS 피드)
 * 2. 기존 키워드의 변형/조합으로 롱테일 키워드 발굴
 * 3. 카테고리별 인기 키워드 시드 활용
 * 4. 계절성/이벤트 기반 키워드
 * 
 * 사용법:
 *   npx tsx scripts/discover-trending-keywords.ts
 *   npx tsx scripts/discover-trending-keywords.ts --strategy rss
 *   npx tsx scripts/discover-trending-keywords.ts --strategy variations
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@libsql/client';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

interface DiscoveredKeyword {
    keyword: string;
    source: string;
    reason: string;
}

/**
 * 전략 1: 네이버 실시간 검색어 (RSS 피드)
 * 참고: 네이버 실시간 검색어는 공식 API가 없지만, RSS 피드나 웹 스크래핑으로 접근 가능
 */
async function discoverFromNaverRealtime(): Promise<DiscoveredKeyword[]> {
    const keywords: DiscoveredKeyword[] = [];
    
    try {
        // 네이버 실시간 검색어 RSS 피드 (비공식, 변경될 수 있음)
        const rssUrl = 'https://datalab.naver.com/keyword/realtimeList.naver';
        
        // 실제로는 웹 스크래핑이 필요하지만, 여기서는 예시만 제공
        // 실제 구현 시 puppeteer나 cheerio 사용 고려
        
        console.log('📡 네이버 실시간 검색어 수집 (RSS/웹 스크래핑 필요)');
        console.log('   ⚠️  공식 API가 없어 웹 스크래핑이 필요합니다.');
        
    } catch (error: any) {
        console.error('❌ 실시간 검색어 수집 실패:', error.message);
    }
    
    return keywords;
}

/**
 * 전략 2: 기존 키워드의 변형/조합으로 롱테일 키워드 발굴
 */
async function discoverFromVariations(): Promise<DiscoveredKeyword[]> {
    const keywords: DiscoveredKeyword[] = [];
    
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        console.error('❌ 환경 변수가 설정되지 않았습니다.');
        return keywords;
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        console.log('🔍 기존 키워드 변형/조합으로 새 키워드 발굴 중...\n');

        // 인기 키워드 중에서 변형 생성
        const popularKeywords = await client.execute({
            sql: `
                SELECT keyword, total_search_cnt
                FROM keywords
                WHERE total_search_cnt >= 5000
                ORDER BY total_search_cnt DESC
                LIMIT 100
            `
        });

        const variations: string[] = [];
        const suffixes = ['추천', '순위', '가격', '할인', '구매', '리뷰', '후기', '비교', '정보', '가이드'];
        const prefixes = ['최신', '인기', '베스트', '추천', '핫'];
        const modifiers = ['저렴한', '좋은', '최고의', '인기', '추천'];

        for (const row of popularKeywords.rows) {
            const baseKeyword = row.keyword as string;
            
            // 접미사 추가
            for (const suffix of suffixes) {
                const variation = `${baseKeyword} ${suffix}`;
                if (variation.length <= 30) { // 키워드 길이 제한
                    variations.push(variation);
                }
            }
            
            // 수식어 추가
            for (const modifier of modifiers) {
                const variation = `${modifier} ${baseKeyword}`;
                if (variation.length <= 30) {
                    variations.push(variation);
                }
            }
        }

        // DB에 없는 키워드만 필터링
        const uniqueVariations = [...new Set(variations)];
        const placeholders = uniqueVariations.map(() => '?').join(',');
        
        if (uniqueVariations.length > 0) {
            const existingResult = await client.execute({
                sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
                args: uniqueVariations
            });
            
            const existingKeywords = new Set(
                existingResult.rows.map(r => r.keyword as string)
            );
            
            const newKeywords = uniqueVariations
                .filter(kw => !existingKeywords.has(kw))
                .slice(0, 200); // 최대 200개
            
            for (const kw of newKeywords) {
                keywords.push({
                    keyword: kw,
                    source: 'variation',
                    reason: `기존 인기 키워드의 변형`
                });
            }
        }

        console.log(`✅ 변형 키워드 ${keywords.length}개 발견\n`);

    } catch (error: any) {
        console.error('❌ 변형 키워드 발굴 실패:', error.message);
    }
    
    return keywords;
}

/**
 * 전략 3: 카테고리별 인기 키워드 시드 활용
 */
async function discoverFromCategories(): Promise<DiscoveredKeyword[]> {
    const keywords: DiscoveredKeyword[] = [];
    
    // 주요 카테고리별 인기 키워드 시드
    const categorySeeds = [
        // 쇼핑
        '패션', '뷰티', '전자제품', '가전', '가구', '식품', '생활용품',
        // 여행/레저
        '여행', '호텔', '항공', '렌터카', '관광지', '맛집',
        // 건강/의료
        '병원', '약국', '운동', '다이어트', '건강식품',
        // 교육
        '학원', '온라인강의', '자격증', '어학', '입시',
        // 금융
        '은행', '보험', '투자', '대출', '카드',
        // 부동산
        '부동산', '매매', '전세', '월세', '아파트',
        // 자동차
        '자동차', '중고차', '정비', '보험',
        // 음식/외식
        '맛집', '카페', '배달', '요리', '레시피',
        // 엔터테인먼트
        '영화', '드라마', '게임', '음악', '책',
        // 스포츠
        '축구', '야구', '농구', '골프', '테니스',
    ];

    console.log('📂 카테고리별 인기 키워드 시드 활용\n');
    console.log(`   시드 키워드: ${categorySeeds.length}개`);
    console.log('   ⚠️  이 시드들을 연관 키워드 API로 확장하면 새로운 키워드를 발견할 수 있습니다.\n');

    for (const seed of categorySeeds) {
        keywords.push({
            keyword: seed,
            source: 'category_seed',
            reason: '카테고리별 인기 키워드 시드'
        });
    }
    
    return keywords;
}

/**
 * 전략 4: 계절성/이벤트 기반 키워드
 */
async function discoverFromSeasonalEvents(): Promise<DiscoveredKeyword[]> {
    const keywords: DiscoveredKeyword[] = [];
    
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    // 계절별 키워드
    const seasonalKeywords: { [key: number]: string[] } = {
        1: ['신정', '설날', '겨울옷', '스키', '보드', '온천'],
        2: ['설날', '발렌타인', '겨울옷', '스키', '보드'],
        3: ['입학식', '졸업식', '봄옷', '벚꽃', '여행'],
        4: ['벚꽃', '봄옷', '피크닉', '야외활동'],
        5: ['어린이날', '가정의날', '여행', '야외활동'],
        6: ['여름옷', '휴가', '여행', '수영', '해변'],
        7: ['여름옷', '휴가', '여행', '수영', '해변', '에어컨'],
        8: ['여름옷', '휴가', '여행', '수영', '해변', '에어컨'],
        9: ['추석', '가을옷', '여행', '등산'],
        10: ['가을옷', '등산', '단풍', '여행'],
        11: ['가을옷', '등산', '단풍'],
        12: ['크리스마스', '연말', '겨울옷', '선물', '파티'],
    };
    
    // 이벤트 키워드
    const eventKeywords = [
        '블랙프라이데이', '싱글데이', '광복절', '추석', '설날',
        '할인', '세일', '프로모션', '이벤트'
    ];
    
    const monthKeywords = seasonalKeywords[month] || [];
    const allKeywords = [...monthKeywords, ...eventKeywords];
    
    console.log(`📅 계절성/이벤트 기반 키워드 (${month}월)\n`);
    
    for (const kw of allKeywords) {
        keywords.push({
            keyword: kw,
            source: 'seasonal',
            reason: `${month}월 계절성/이벤트 키워드`
        });
    }
    
    return keywords;
}

/**
 * 전략 5: DB에 없는 인기 키워드 찾기 (외부 소스 활용)
 */
async function discoverFromExternalSources(): Promise<DiscoveredKeyword[]> {
    const keywords: DiscoveredKeyword[] = [];
    
    // 구글 트렌드, 소셜미디어 트렌드 등 외부 소스 활용
    // 실제 구현 시 해당 API 연동 필요
    
    console.log('🌐 외부 소스 활용 (구글 트렌드, 소셜미디어 등)\n');
    console.log('   ⚠️  외부 API 연동이 필요합니다.\n');
    
    return keywords;
}

/**
 * 발견된 키워드 중 DB에 없는 것만 필터링
 */
async function filterNewKeywords(discovered: DiscoveredKeyword[]): Promise<DiscoveredKeyword[]> {
    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
        return discovered;
    }

    try {
        const client = createClient({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
        });

        const keywords = discovered.map(d => d.keyword);
        if (keywords.length === 0) return [];

        const placeholders = keywords.map(() => '?').join(',');
        const existingResult = await client.execute({
            sql: `SELECT keyword FROM keywords WHERE keyword IN (${placeholders})`,
            args: keywords
        });

        const existingKeywords = new Set(
            existingResult.rows.map(r => r.keyword as string)
        );

        return discovered.filter(d => !existingKeywords.has(d.keyword));

    } catch (error: any) {
        console.error('❌ 필터링 실패:', error.message);
        return discovered;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] || 'all';

    console.log('🔍 인기 검색어지만 아직 수집하지 못한 키워드 발굴 시작\n');
    console.log(`📋 전략: ${strategy}\n`);
    console.log('─'.repeat(80));
    console.log('');

    const allDiscovered: DiscoveredKeyword[] = [];

    if (strategy === 'all' || strategy === 'variations') {
        const variations = await discoverFromVariations();
        allDiscovered.push(...variations);
    }

    if (strategy === 'all' || strategy === 'categories') {
        const categories = await discoverFromCategories();
        allDiscovered.push(...categories);
    }

    if (strategy === 'all' || strategy === 'seasonal') {
        const seasonal = await discoverFromSeasonalEvents();
        allDiscovered.push(...seasonal);
    }

    if (strategy === 'all' || strategy === 'rss') {
        const rss = await discoverFromNaverRealtime();
        allDiscovered.push(...rss);
    }

    if (strategy === 'all' || strategy === 'external') {
        const external = await discoverFromExternalSources();
        allDiscovered.push(...external);
    }

    // 중복 제거
    const uniqueKeywords = new Map<string, DiscoveredKeyword>();
    for (const item of allDiscovered) {
        if (!uniqueKeywords.has(item.keyword)) {
            uniqueKeywords.set(item.keyword, item);
        }
    }

    // DB에 없는 키워드만 필터링
    const newKeywords = await filterNewKeywords(Array.from(uniqueKeywords.values()));

    console.log('─'.repeat(80));
    console.log(`\n✅ 총 ${newKeywords.length}개의 새로운 키워드 발견!\n`);

    if (newKeywords.length > 0) {
        // 소스별 그룹화
        const bySource = new Map<string, DiscoveredKeyword[]>();
        for (const item of newKeywords) {
            if (!bySource.has(item.source)) {
                bySource.set(item.source, []);
            }
            bySource.get(item.source)!.push(item);
        }

        console.log('📊 소스별 분류:');
        for (const [source, items] of bySource.entries()) {
            console.log(`   ${source}: ${items.length}개`);
        }
        console.log('');

        // 상위 50개 출력
        const top50 = newKeywords.slice(0, 50);
        console.log('📋 발견된 키워드 (상위 50개):');
        console.log('─'.repeat(80));
        top50.forEach((item, idx) => {
            console.log(`${(idx + 1).toString().padStart(3)}. ${item.keyword.padEnd(30)} [${item.source}] ${item.reason}`);
        });
        console.log('─'.repeat(80));
        console.log('');

        console.log('💡 다음 단계:');
        console.log('   1. 발견된 키워드를 시드로 사용하여 연관 키워드 확장');
        console.log('   2. 수동 수집으로 우선순위 높은 키워드부터 수집');
        console.log('   3. 자동 수집 시스템에 새로운 시드 키워드 추가');
        console.log('');
    } else {
        console.log('⚠️  새로운 키워드를 발견하지 못했습니다.');
        console.log('   다른 전략을 시도해보세요:\n');
        console.log('   npx tsx scripts/discover-trending-keywords.ts --strategy=variations');
        console.log('   npx tsx scripts/discover-trending-keywords.ts --strategy=categories');
        console.log('   npx tsx scripts/discover-trending-keywords.ts --strategy=seasonal');
        console.log('');
    }
}

main().catch(console.error);

