/**
 * 1일 최대 수집량 계산 스크립트
 * 
 * 현재 설정을 기반으로 연관검색어 및 문서수 수집량을 계산합니다.
 */

interface CollectionConfig {
    name: string;
    schedule: string; // cron 표현식
    runForSeconds: number;
    intervalSeconds: number;
    batchSize: number;
    concurrency: number;
    avgKeywordsPerSeed?: number; // Expand 작업만
}

// 현재 설정
const expandConfig: CollectionConfig = {
    name: '연관검색어 수집 (Expand)',
    schedule: '*/15 * * * *', // 15분마다
    runForSeconds: 180, // 3분
    intervalSeconds: 30, // 30초마다 호출
    batchSize: 300, // expandBatch
    concurrency: 50, // expandConcurrency
    avgKeywordsPerSeed: 20 // 시드당 평균 수집 키워드 수
};

const fillDocsConfig: CollectionConfig = {
    name: '문서수 수집 (Fill Docs)',
    schedule: '2-59/5 * * * *', // 5분마다
    runForSeconds: 180, // 3분
    intervalSeconds: 20, // 20초마다 호출
    batchSize: 180, // fillBatch
    concurrency: 28 // fillConcurrency
};

function calculateDailyCollection(config: CollectionConfig) {
    // 하루 실행 횟수 계산
    // cron: */15 * * * * => 24시간 * 60분 / 15분 = 96회
    // cron: 2-59/5 * * * * => 24시간 * 60분 / 5분 = 288회
    const scheduleParts = config.schedule.split(' ');
    let dailyRuns = 0;
    
    if (scheduleParts[0].includes('*/')) {
        const interval = parseInt(scheduleParts[0].replace('*/', ''));
        dailyRuns = (24 * 60) / interval;
    } else if (scheduleParts[0].includes('/')) {
        // 2-59/5 형식
        const interval = parseInt(scheduleParts[0].split('/')[1]);
        dailyRuns = (24 * 60) / interval;
    }
    
    // 실행당 호출 횟수
    const callsPerRun = Math.floor(config.runForSeconds / config.intervalSeconds);
    
    // 실행당 처리량
    let processedPerRun = 0;
    if (config.avgKeywordsPerSeed) {
        // Expand: 시드당 평균 키워드 수집
        processedPerRun = callsPerRun * config.batchSize * config.avgKeywordsPerSeed;
    } else {
        // Fill Docs: 배치 크기만큼 처리
        processedPerRun = callsPerRun * config.batchSize;
    }
    
    // 일일 처리량
    const dailyProcessed = processedPerRun * dailyRuns;
    
    // 실제 안전 처리량 (80% 효율 가정)
    const safeDailyProcessed = Math.floor(dailyProcessed * 0.8);
    
    return {
        dailyRuns,
        callsPerRun,
        processedPerRun,
        dailyProcessed,
        safeDailyProcessed
    };
}

console.log('='.repeat(80));
console.log('📊 1일 최대 수집량 계산');
console.log('='.repeat(80));
console.log('');

// Expand 작업 계산
const expandResult = calculateDailyCollection(expandConfig);
console.log(`🔍 ${expandConfig.name}`);
console.log(`   스케줄: ${expandConfig.schedule}`);
console.log(`   실행 시간: ${expandConfig.runForSeconds}초`);
console.log(`   호출 간격: ${expandConfig.intervalSeconds}초`);
console.log(`   배치 크기: ${expandConfig.batchSize}개 시드`);
console.log(`   동시성: ${expandConfig.concurrency}`);
console.log(`   시드당 평균 수집: ${expandConfig.avgKeywordsPerSeed}개 키워드`);
console.log('');
console.log(`   📈 계산 결과:`);
console.log(`   - 하루 실행 횟수: ${expandResult.dailyRuns}회`);
console.log(`   - 실행당 호출 횟수: ${expandResult.callsPerRun}회`);
console.log(`   - 실행당 수집 키워드: ${expandResult.processedPerRun.toLocaleString()}개`);
console.log(`   - 일일 수집 키워드 (이론상): ${expandResult.dailyProcessed.toLocaleString()}개`);
console.log(`   - 일일 수집 키워드 (안전): ${expandResult.safeDailyProcessed.toLocaleString()}개`);
console.log('');

// Fill Docs 작업 계산
const fillDocsResult = calculateDailyCollection(fillDocsConfig);
console.log(`📄 ${fillDocsConfig.name}`);
console.log(`   스케줄: ${fillDocsConfig.schedule}`);
console.log(`   실행 시간: ${fillDocsConfig.runForSeconds}초`);
console.log(`   호출 간격: ${fillDocsConfig.intervalSeconds}초`);
console.log(`   배치 크기: ${fillDocsConfig.batchSize}개 키워드`);
console.log(`   동시성: ${fillDocsConfig.concurrency}`);
console.log('');
console.log(`   📈 계산 결과:`);
console.log(`   - 하루 실행 횟수: ${fillDocsResult.dailyRuns}회`);
console.log(`   - 실행당 호출 횟수: ${fillDocsResult.callsPerRun}회`);
console.log(`   - 실행당 처리 키워드: ${fillDocsResult.processedPerRun.toLocaleString()}개`);
console.log(`   - 일일 처리 키워드 (이론상): ${fillDocsResult.dailyProcessed.toLocaleString()}개`);
console.log(`   - 일일 처리 키워드 (안전): ${fillDocsResult.safeDailyProcessed.toLocaleString()}개`);
console.log('');

// 총합
const totalDaily = expandResult.dailyProcessed + fillDocsResult.dailyProcessed;
const totalSafeDaily = expandResult.safeDailyProcessed + fillDocsResult.safeDailyProcessed;

console.log('='.repeat(80));
console.log('📊 종합 결과');
console.log('='.repeat(80));
console.log(`   연관검색어 수집 (이론상): ${expandResult.dailyProcessed.toLocaleString()}개/일`);
console.log(`   연관검색어 수집 (안전): ${expandResult.safeDailyProcessed.toLocaleString()}개/일`);
console.log(`   문서수 수집 (이론상): ${fillDocsResult.dailyProcessed.toLocaleString()}개/일`);
console.log(`   문서수 수집 (안전): ${fillDocsResult.safeDailyProcessed.toLocaleString()}개/일`);
console.log('');
console.log(`   🎯 총 수집량 (이론상): ${totalDaily.toLocaleString()}개/일`);
console.log(`   🎯 총 수집량 (안전): ${totalSafeDaily.toLocaleString()}개/일`);
console.log('='.repeat(80));

