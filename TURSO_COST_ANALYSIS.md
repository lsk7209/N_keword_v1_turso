# Turso 비용 분석 및 최적화 보고서

## 📊 현재 설정 기준 월간 DB 사용량 예측

### Expand 작업 (miner.yml)
- 크론 주기: 5분 = 하루 288회
- 루프당 API 호출: 24회 (4분/10초)
- 일일 API 호출: 288 × 24 = **6,912회**
- 월간 API 호출: 6,912 × 30 = **207,360회**

#### Row Writes 계산
- 시드 선점: 1,500 rows × 207,360회 = 311,040,000 rows
- Bulk Insert: 평균 30,000 keywords × 207,360회 = 6,220,800,000 rows (대부분 IGNORE됨)
  - 실제 신규 INSERT: 약 500개/API = 103,680,000 rows
- 상태 업데이트: 1,500 rows × 207,360회 = 311,040,000 rows

**Expand 예상 Row Writes: ~700M rows/월**

#### Row Reads 계산
- 시드 선점 시 서브쿼리: ~10,000 rows 스캔/호출 × 207,360회 = 2,073,600,000 rows
- INSERT OR IGNORE 중복 체크: ~30,000 rows/호출 × 207,360회 = 6,220,800,000 rows

**Expand 예상 Row Reads: ~8B rows/월**

### Fill Docs 작업 (fill-docs.yml)
- 크론 주기: 5분 = 하루 288회
- 루프당 API 호출: 21회 (3.5분/10초)
- 일일 API 호출: 288 × 21 = **6,048회**
- 월간 API 호출: 6,048 × 30 = **181,440회**

#### Row Writes 계산
- 대상 선점: 500 rows × 181,440회 = 90,720,000 rows
- Bulk Update: 500 rows × 181,440회 = 90,720,000 rows

**Fill Docs 예상 Row Writes: ~180M rows/월**

#### Row Reads 계산
- 대상 선점 시 서브쿼리: ~500 rows 스캔/호출 × 181,440회 = 90,720,000 rows

**Fill Docs 예상 Row Reads: ~90M rows/월**

---

## 💰 예상 월간 비용 (Free Plan 초과 시)

| 항목 | 예상 사용량 | 무료 한도 | 초과분 | 요금 |
|------|-------------|-----------|--------|------|
| **Row Reads** | ~8.1B | 500M | ~7.6B | **$7.60** |
| **Row Writes** | ~880M | 10M | ~870M | **$870.00** ⚠️ |
| **Storage** | ~5GB | 5GB | 0 | $0 |
| **총계** | - | - | - | **~$877.60/월** ⚠️ |

---

## 🚨 Row Writes가 주요 비용 원인!

**가장 큰 문제: `INSERT OR IGNORE`로 인한 Row Writes**

- 30,000개 키워드 × 207,360회 = 6.2B rows 시도
- 대부분 IGNORE되어도 **Write로 카운트됨**
- Turso는 IGNORE된 INSERT도 Write로 간주할 가능성 높음

---

## ✅ 최적화 방안

### 1. 중복 키워드 사전 필터링 (가장 효과적)
DB에 INSERT하기 전에 기존 키워드인지 미리 확인

```typescript
// 메모리 캐시에서 중복 제거 후 진짜 신규만 INSERT
const existingKeywords = await db.execute({
  sql: 'SELECT keyword FROM keywords WHERE keyword IN (?, ?, ...)',
  args: [...keywordList]
});
const newKeywords = keywords.filter(k => !existingSet.has(k));
await bulkDeferredInsert(newKeywords);
```

**예상 절감: Write 90% 감소 → ~$80/월**

### 2. 배치 크기 축소 (안정성 향상)
- expandBatch: 1500 → 500
- fillBatch: 500 → 200

**예상 절감: Write 60~70% 감소**

### 3. 크론 빈도 감소
- 5분마다 → 10분마다 (일일 수집량 50% 감소하지만 비용도 50% 감소)

### 4. Scaler Plan 업그레이드 ($29/월)
- Row Reads: 100B (충분)
- Row Writes: 100M (현재의 10분의 1 수준)
- 초과 시 $0.80/100만 (Free Plan의 $1보다 저렴)

---

## 📋 권장 사항

1. **즉시 적용**: 중복 필터링 로직 추가 (Row Writes 90% 감소)
2. **배치 크기 조정**: expandBatch 500, fillBatch 200으로 축소
3. **모니터링**: Turso 대시보드에서 실제 사용량 확인
4. **필요시**: Scaler Plan 업그레이드 고려 ($29/월)

현재 무료 플랜으로 유지하려면 **반드시 중복 필터링을 구현해야 합니다.**
