# 📋 단계별 인덱스 생성 가이드

이 가이드는 **80만 개 이상의 키워드 데이터**에서 발생하는 Rows Read 폭증 문제를 단계별로 해결합니다.

---

## 🎯 목표

- **Rows Read**: 5억 회 → 수백만 회 (99% 감소)
- **쿼리 시간**: 수 초 → 수십 ms (95% 이상 개선)

---

## 📝 사전 준비

### 1. Turso CLI 설치 확인

```bash
# Turso CLI 설치 여부 확인
turso --version

# 설치되어 있지 않다면
curl -sSfL https://get.tur.so/install.sh | bash
```

### 2. 데이터베이스 연결 확인

```bash
# 데이터베이스 목록 확인
turso db list

# 데이터베이스에 연결
turso db shell your-database-name
```

---

## 🚀 단계별 실행

### STEP 0: 현재 상태 확인

```bash
turso db shell your-database-name
```

```sql
-- 현재 인덱스 목록 확인
SELECT 
    name as index_name,
    sql
FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;

-- 데이터 통계 확인
SELECT COUNT(*) as total_keywords FROM keywords;
SELECT COUNT(*) as pending_expand FROM keywords WHERE is_expanded = 0;
SELECT COUNT(*) as pending_docs FROM keywords WHERE total_doc_cnt IS NULL;
```

**확인 사항:**
- 현재 인덱스 개수
- 총 키워드 수
- 확장 대기 중인 키워드 수
- 문서 수 채우기 대기 중인 키워드 수

---

### STEP 1: 중복 체크 최적화 ⚡ (1-2분)

**우선순위**: 🔴 최우선  
**영향**: `WHERE keyword = ?` 쿼리

```sql
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);
```

**검증:**
```sql
EXPLAIN QUERY PLAN
SELECT id FROM keywords WHERE keyword = '테스트키워드';
```

**예상 결과**: `SEARCH TABLE keywords USING INDEX idx_keyword_lookup`

**완료 확인**: ✅ 인덱스가 사용되는지 확인

---

### STEP 2: 확장 대상 조회 최적화 🔥 (3-5분)

**우선순위**: 🔴 최우선 (가장 중요!)  
**영향**: `WHERE is_expanded = 0 AND total_search_cnt >= ? ORDER BY total_search_cnt DESC`  
**효과**: 80만 행 → 수백 행만 스캔

```sql
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);
```

**검증:**
```sql
EXPLAIN QUERY PLAN
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;
```

**예상 결과**: `SEARCH TABLE keywords USING INDEX idx_expand_candidates`

**성능 측정 (선택사항):**
```sql
.timer on
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;
```

**완료 확인**: ✅ 쿼리 시간이 수 ms로 단축되었는지 확인

---

### STEP 3: 문서 수 채우기 최적화 🔥 (3-5분)

**우선순위**: 🔴 최우선 (가장 중요!)  
**영향**: `WHERE total_doc_cnt IS NULL ORDER BY total_search_cnt DESC`  
**효과**: 80만 행 → 수백 행만 스캔

```sql
-- Partial Index 사용 (SQLite 3.8.0+)
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;
```

**만약 Partial Index 에러 발생 시:**
```sql
-- 대안: 일반 인덱스 사용
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

**검증:**
```sql
EXPLAIN QUERY PLAN
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE total_doc_cnt IS NULL 
ORDER BY total_search_cnt DESC 
LIMIT 100;
```

**예상 결과**: `SEARCH TABLE keywords USING INDEX idx_fill_docs_candidates`

**완료 확인**: ✅ 인덱스가 사용되는지 확인

---

### STEP 4: 필터링 + 정렬 최적화 (3-5분)

**우선순위**: 🟡 높음  
**영향**: `WHERE total_doc_cnt IS NOT NULL ORDER BY ...`

```sql
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;
```

**만약 Partial Index 에러 발생 시:**
```sql
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

**검증:**
```sql
EXPLAIN QUERY PLAN
SELECT * FROM keywords 
WHERE total_doc_cnt IS NOT NULL 
ORDER BY total_search_cnt DESC 
LIMIT 50;
```

**완료 확인**: ✅ 인덱스가 사용되는지 확인

---

### STEP 5: 시간 범위 통계 최적화 (2-3분)

**우선순위**: 🟢 중간  
**영향**: `WHERE created_at >= ?`

```sql
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);
```

**검증:**
```sql
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM keywords WHERE created_at >= datetime('now', '-1 day');
```

**완료 확인**: ✅ 인덱스가 사용되는지 확인

---

### STEP 6: 최종 확인

```sql
-- 생성된 모든 인덱스 확인
SELECT 
    name as index_name,
    CASE 
        WHEN sql LIKE '%WHERE%' THEN 'Partial Index'
        ELSE 'Full Index'
    END as index_type
FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;

-- 통계 업데이트 (인덱스 사용 최적화)
ANALYZE keywords;
```

**확인 사항:**
- ✅ `idx_keyword_lookup` 생성됨
- ✅ `idx_expand_candidates` 생성됨
- ✅ `idx_fill_docs_candidates` 생성됨
- ✅ `idx_has_docs` 생성됨
- ✅ `idx_created_at_range` 생성됨

---

### STEP 7: 성능 비교 테스트 (선택사항)

```sql
-- 테스트 쿼리 1: 확장 대상 조회
.timer on
SELECT COUNT(*) as count
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000;

-- 테스트 쿼리 2: 문서 수 채우기
.timer on
SELECT COUNT(*) as count
FROM keywords 
WHERE total_doc_cnt IS NULL;

-- 테스트 쿼리 3: 중복 체크
.timer on
SELECT id FROM keywords WHERE keyword = '테스트키워드12345';
```

**예상 결과:**
- 쿼리 시간: **수백 ms → 수 ms**
- Rows Read: **80만 → 수백**

---

## 📊 전체 스크립트 한 번에 실행 (권장)

모든 단계를 한 번에 실행하려면:

```bash
turso db shell your-database-name < turso/step_by_step_indexes.sql
```

또는

```bash
turso db shell your-database-name < turso/optimize_indexes.sql
```

---

## ✅ 완료 후 확인 사항

### 1. Turso 대시보드 확인
- **Rows Read** 지표가 **99% 이상 감소**했는지 확인
- **쿼리 시간**이 개선되었는지 확인

### 2. 애플리케이션 모니터링
- 자동 채굴 작업이 정상적으로 실행되는지 확인
- 사용자 조회 쿼리가 빠르게 응답하는지 확인

### 3. 24시간 후 재확인
- Rows Read 지표가 안정적으로 유지되는지 확인
- 필요 시 추가 인덱스 생성 고려

---

## 🆘 문제 해결

### Partial Index 에러 발생 시

```
Error: near "WHERE": syntax error
```

**해결**: Partial Index를 일반 인덱스로 변경
```sql
-- WHERE 절 제거
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

### 인덱스 생성이 너무 오래 걸릴 때

- **정상**: 80만 행 기준 인덱스당 1-5분 소요
- **비정상**: 10분 이상 소요 시 중단 후 재시도

### 인덱스가 사용되지 않을 때

```sql
-- 통계 업데이트
ANALYZE keywords;

-- 쿼리 실행 계획 재확인
EXPLAIN QUERY PLAN
SELECT ... FROM keywords WHERE ...;
```

---

## 📈 예상 성능 개선

| 지표 | Before | After | 개선율 |
|------|--------|-------|--------|
| 확장 대상 조회 | 800,000 rows | ~1,000 rows | **99.9% 감소** |
| 문서 수 채우기 | 800,000 rows | ~1,000 rows | **99.9% 감소** |
| 중복 체크 | 800,000 rows | ~1 row | **99.999% 감소** |
| 쿼리 시간 | 500-2000ms | 5-20ms | **95-99% 개선** |
| 총 Rows Read | 5억 회 | 수백만 회 | **99% 감소** |

---

## 🎉 완료!

모든 필수 인덱스가 생성되었습니다. 이제 데이터베이스가 훨씬 빠르게 동작할 것입니다!

**다음 단계:**
1. 24시간 모니터링
2. Turso 대시보드에서 Rows Read 확인
3. 필요 시 추가 최적화 (`turso/optimize_indexes.sql` 참고)

