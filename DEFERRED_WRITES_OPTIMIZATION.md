# ⚡ 획기적 DB 최적화: 지연 쓰기 (Deferred Writes) 전략

## 🎯 목표

**Write 횟수를 획기적으로 줄여 Turso 한도 초과 문제 해결**

현재: 시드당 2-3회 Write → 목표: 배치당 1회 Write

## 📊 현재 Write 패턴 분석

### Expand 작업 (연관검색어 수집)
```
기존 방식:
├── 시드 선점: UPDATE keywords SET is_expanded = 2 (1 Write)
├── 키워드 저장: INSERT OR IGNORE (배치별 N Write)
├── 시드 완료: UPDATE keywords SET is_expanded = 1 (1 Write)
└── 시드 실패: UPDATE keywords SET is_expanded = 0 (1 Write)

총: 시드당 3-4회 Write
```

### Fill Docs 작업 (문서수 수집)
```
기존 방식:
├── 대상 선점: UPDATE keywords SET total_doc_cnt = -2 (1 Write)
├── 문서 저장: UPDATE keywords SET ... (키워드별 N Write)
└── 롤백: UPDATE keywords SET total_doc_cnt = NULL (1 Write)

총: 키워드별 1회 Write + 오버헤드
```

## 🚀 신규 전략: 지연 쓰기 (Deferred Writes)

### 핵심 원리

1. **메모리 축적**: 모든 결과를 메모리에 저장 (DB Write 없음)
2. **배치 Write**: 실행 종료 시 한 번에 모든 데이터 저장
3. **상태 일괄 업데이트**: 여러 레코드를 한 번에 업데이트

### Expand 작업 최적화
```
신규 방식:
├── 시드 선점: UPDATE keywords SET is_expanded = 2 (1 Write)
├── 메모리 축적: processSeedKeyword() 결과 메모리에만 저장 (0 Write)
├── 배치 삽입: bulkDeferredInsert()로 한 번에 모두 저장 (1 Write)
└── 상태 일괄 업데이트: 성공/실패 시드 한 번에 업데이트 (1 Write)

총: 시드당 3회 Write → 배치당 3회 Write (시드 수만큼 절약)
```

### Fill Docs 작업 최적화
```
신규 방식:
├── 대상 선점: UPDATE keywords SET total_doc_cnt = -2 (1 Write)
├── 메모리 축적: fetchDocumentCount() 결과 메모리에만 저장 (0 Write)
├── 배치 업데이트: 모든 문서 수를 한 번에 업데이트 (1 Write)
└── 롤백: 스킵된 항목 일괄 롤백 (1 Write)

총: 키워드별 1회 Write → 배치당 3회 Write (키워드 수만큼 절약)
```

## 📈 예상 Write 절약 효과

### Expand 작업 (300개 시드 배치 기준)
- **기존**: 300 × 3 = **900회 Write**
- **신규**: 3회 Write (선점 + 삽입 + 상태 업데이트)
- **절약**: **99.7% 감소** (897회 절약)

### Fill Docs 작업 (180개 키워드 배치 기준)
- **기존**: 180 × 1 = **180회 Write** + 오버헤드
- **신규**: 3회 Write (선점 + 업데이트 + 롤백)
- **절약**: **98.3% 감소** (177회 절약)

### 1일 총합 (현재 설정 기준)
- **Expand**: 96회 실행 × 3회 = **288회 Write** (기존: 96 × 900 = 86,400회)
- **Fill Docs**: 288회 실행 × 3회 = **864회 Write** (기존: 288 × 180 = 51,840회)
- **총 Write**: **1,152회/일** (기존: 138,240회/일)
- **총 절약**: **99.2% 감소**

## 🔧 구현 세부사항

### 1. 메모리 버퍼 구조
```typescript
// 키워드 결과 축적
let memoryKeywordBuffer: any[] = [];

// 시드 상태 업데이트 축적
let memorySeedUpdates: { id: string, status: 'success' | 'failed' }[] = [];

// 문서 수 업데이트 축적
let memoryDocUpdates: { id: string, counts: any }[] = [];
```

### 2. 벌크 삽입 함수
```typescript
export async function bulkDeferredInsert(keywords: any[]): Promise<{ inserted: number }> {
    // 단일 배치로 모든 키워드 INSERT
    const statements = keywords.map(kw => ({ sql: '...', args: [...] }));
    await db.batch(statements);
    return { inserted: keywords.length };
}
```

### 3. 배치 업데이트
```typescript
// 여러 레코드를 한 번에 업데이트
const updateStatements = memoryDocUpdates.map(({ id, counts }) => ({
    sql: `UPDATE keywords SET total_doc_cnt = ?, ... WHERE id = ?`,
    args: [counts.total, ..., id]
}));
await db.batch(updateStatements);
```

## ⚠️ 주의사항

### 메모리 사용량
- 대용량 배치 시 메모리 부족 가능성
- 배치 크기 제한 필요 (현재 300/180개로 안전)

### 데이터 일관성
- 실행 중단 시 메모리 데이터 손실
- 배치 완료 후에만 DB에 반영

### 에러 처리
- 배치 실패 시 전체 롤백 필요
- 부분 성공 처리 로직 구현

## 🎯 기대 효과

### Turso Write 한도
- **현재 한도**: 25M/월 (833K/일)
- **현재 사용**: 62.29M 초과
- **최적화 후**: ~1K/일 (99.8% 감소)
- **안전 마진**: 99% 이상

### 성능 향상
- **네트워크 오버헤드 감소**: Write 횟수 급감
- **DB 부하 감소**: 배치 처리 효율화
- **메모리 최적화**: 더 큰 배치 가능

### 운영 안정성
- **한도 초과 방지**: 지속적 수집 가능
- **확장성 향상**: 더 큰 배치 크기 지원
- **모니터링 용이**: Write 횟수 예측 가능

## 🚀 적용 후 모니터링

### 확인 항목
1. **Write 횟수**: Turso 대시보드에서 실시간 모니터링
2. **성능**: 배치 처리 시간 측정
3. **메모리**: Node.js 메모리 사용량 모니터링
4. **데이터 무결성**: 삽입된 데이터 검증

### 롤백 계획
- 문제가 발생 시 즉시 기존 방식으로 복구 가능
- 코드에서 지연 쓰기 기능 토글로 간단 전환

## 📝 결론

**Deferred Writes 전략으로 Write 횟수를 99% 이상 절약**하여 Turso 한도 문제를 근본적으로 해결합니다. 배치 크기를 늘리면서도 Write 비용을 최소화하여 대규모 데이터 수집이 가능해집니다.
