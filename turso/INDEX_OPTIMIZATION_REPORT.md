# 🔍 Turso 데이터베이스 인덱스 최적화 리포트

## 📊 문제 상황 분석

### 현재 데이터 규모
- **키워드 수**: 80만 개 이상
- **문제**: Rows Read가 5억 회에 육박 (비정상적 증가)
- **원인**: Full Table Scan 발생

---

## 🎯 원인 분석: Full Table Scan 발생 쿼리

### 1. **가장 치명적인 쿼리 (최우선 해결 필요)**

#### ❌ 쿼리 패턴 1: 확장 대상 조회
```sql
WHERE is_expanded = 0 AND total_search_cnt >= ? 
ORDER BY total_search_cnt DESC
```
- **빈도**: 매우 높음 (5분마다 자동 실행)
- **문제**: `is_expanded` 컬럼에 인덱스 없음
- **영향**: 80만 행 전체 스캔 → **80만 Rows Read**
- **해결**: 복합 인덱스 `(is_expanded, total_search_cnt DESC)` 필요

#### ❌ 쿼리 패턴 2: 문서 수 채우기
```sql
WHERE total_doc_cnt IS NULL 
ORDER BY total_search_cnt DESC
```
- **빈도**: 매우 높음 (5분마다 자동 실행)
- **문제**: `total_doc_cnt`에 인덱스 없음 + NULL 체크
- **영향**: 80만 행 전체 스캔 → **80만 Rows Read**
- **해결**: 복합 인덱스 `(total_doc_cnt, total_search_cnt DESC)` + Partial Index

#### ❌ 쿼리 패턴 3: 중복 체크
```sql
WHERE keyword = ?
```
- **빈도**: 매우 높음 (키워드 삽입/업데이트 시마다)
- **문제**: UNIQUE 제약은 있지만 명시적 인덱스 권장
- **영향**: 인덱스 미사용 시 80만 행 스캔
- **해결**: `idx_keyword_lookup` 인덱스 생성

### 2. **높은 우선순위 쿼리**

#### ⚠️ 쿼리 패턴 4: 필터링 + 정렬
```sql
WHERE total_doc_cnt IS NOT NULL 
ORDER BY ...
```
- **빈도**: 높음 (사용자 조회 시마다)
- **문제**: `total_doc_cnt` 필터링에 인덱스 없음
- **영향**: 조건에 맞는 행 수에 따라 수만~수십만 행 스캔
- **해결**: Partial Index `(total_doc_cnt, total_search_cnt DESC) WHERE total_doc_cnt IS NOT NULL`

---

## ✅ 인덱스 설계안

### 필수 인덱스 (즉시 생성 필요)

| 인덱스명 | 컬럼 | 용도 | 우선순위 |
|---------|------|------|----------|
| `idx_keyword_lookup` | `keyword` | 중복 체크 | 🔴 최우선 |
| `idx_expand_candidates` | `is_expanded, total_search_cnt DESC` | 확장 대상 조회 | 🔴 최우선 |
| `idx_fill_docs_candidates` | `total_doc_cnt, total_search_cnt DESC` | 문서 수 채우기 | 🔴 최우선 |
| `idx_has_docs` | `total_doc_cnt, total_search_cnt DESC` | 필터링 + 정렬 | 🟡 높음 |

### 선택적 인덱스 (성능 추가 최적화)

| 인덱스명 | 컬럼 | 용도 | 우선순위 |
|---------|------|------|----------|
| `idx_tier_ratio_with_docs` | `total_doc_cnt, tier, golden_ratio DESC` | 등급별 정렬 | 🟢 중간 |
| `idx_cafe_opp_with_docs` | `total_doc_cnt, cafe_doc_cnt, total_search_cnt DESC` | 카페 기회 키워드 | 🟢 중간 |
| `idx_blog_opp_with_docs` | `total_doc_cnt, blog_doc_cnt, total_search_cnt DESC` | 블로그 기회 키워드 | 🟢 중간 |
| `idx_web_opp_with_docs` | `total_doc_cnt, web_doc_cnt, total_search_cnt DESC` | 웹 기회 키워드 | 🟢 중간 |
| `idx_created_at_range` | `created_at` | 시간 범위 통계 | 🟢 중간 |

---

## 📝 실행 가능한 SQL

### 즉시 실행 (필수)

```sql
-- 1. 중복 체크 최적화
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- 2. 확장 대상 조회 최적화 (가장 중요!)
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- 3. 문서 수 채우기 최적화 (가장 중요!)
-- SQLite 3.8.0+ Partial Index 지원
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- 4. 필터링 + 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;
```

### 선택적 실행 (성능 추가 최적화)

```sql
-- 5. 등급별 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_tier_ratio_with_docs 
ON keywords (total_doc_cnt, tier, golden_ratio DESC)
WHERE total_doc_cnt IS NOT NULL;

-- 6. 문서 수별 기회 키워드 찾기
CREATE INDEX IF NOT EXISTS idx_cafe_opp_with_docs 
ON keywords (total_doc_cnt, cafe_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blog_opp_with_docs 
ON keywords (total_doc_cnt, blog_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_opp_with_docs 
ON keywords (total_doc_cnt, web_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- 7. 시간 범위 통계
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);
```

---

## 🔬 복합 인덱스 설계 원칙

### 인덱스 컬럼 순서 결정 규칙

1. **WHERE 절 등호 조건** → 가장 앞에 배치
   - 예: `is_expanded = 0` → 첫 번째 컬럼

2. **WHERE 절 범위 조건** → 두 번째에 배치
   - 예: `total_search_cnt >= 1000` → 두 번째 컬럼

3. **ORDER BY 컬럼** → 마지막에 배치
   - 예: `ORDER BY total_search_cnt DESC` → 이미 범위 조건에 포함되어 있음

### 실제 적용 예시

```sql
-- 쿼리 패턴
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC

-- 최적 인덱스
CREATE INDEX idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);
--        ↑ 등호 조건    ↑ 범위+정렬
```

---

## 📈 예상 성능 개선

### Before (인덱스 없음)

| 쿼리 | Rows Read | 실행 시간 |
|------|-----------|----------|
| 확장 대상 조회 | ~800,000 | 500-2000ms |
| 문서 수 채우기 | ~800,000 | 500-2000ms |
| 중복 체크 | ~800,000 | 100-500ms |
| 필터링 + 정렬 | ~400,000 | 300-1000ms |

### After (인덱스 적용 후)

| 쿼리 | Rows Read | 실행 시간 |
|------|-----------|----------|
| 확장 대상 조회 | ~100-1,000 | 5-20ms |
| 문서 수 채우기 | ~100-1,000 | 5-20ms |
| 중복 체크 | ~1-10 | <1ms |
| 필터링 + 정렬 | ~100-1,000 | 10-30ms |

### 예상 개선율
- **Rows Read**: **99.9% 감소** (800,000 → 1,000)
- **쿼리 시간**: **95-99% 감소** (500ms → 10ms)

---

## 🚀 실행 방법

### 1. 전체 인덱스 생성 (권장)

```bash
turso db shell your-database-name < turso/optimize_indexes.sql
```

### 2. 필수 인덱스만 생성 (빠른 적용)

```bash
# Turso CLI로 직접 실행
turso db shell your-database-name

# 필수 인덱스만 생성
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);
CREATE INDEX IF NOT EXISTS idx_expand_candidates ON keywords (is_expanded, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates ON keywords (total_doc_cnt, total_search_cnt DESC) WHERE total_doc_cnt IS NULL;
CREATE INDEX IF NOT EXISTS idx_has_docs ON keywords (total_doc_cnt, total_search_cnt DESC) WHERE total_doc_cnt IS NOT NULL;
```

### 3. 인덱스 생성 확인

```sql
-- 생성된 인덱스 목록 확인
SELECT name, sql FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;
```

### 4. 인덱스 사용 여부 검증

```sql
-- 쿼리 실행 계획 확인
EXPLAIN QUERY PLAN
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_expand_candidates"
```

---

## ⚠️ 주의사항

### 1. Partial Index 지원 여부
- SQLite 3.8.0+ 에서 Partial Index 지원
- Turso는 최신 SQLite를 사용하므로 문제없음
- 만약 에러 발생 시 `WHERE` 절 제거 후 일반 인덱스 사용

### 2. 인덱스 생성 시간
- 80만 행 기준: 인덱스당 **1-5분** 소요
- 생성 중에는 쓰기 성능이 일시적으로 저하될 수 있음
- **비피크 시간대에 실행 권장**

### 3. 인덱스 저장 공간
- 인덱스당 약 **10-50MB** 추가 공간 필요
- 총 추가 공간: 약 **100-300MB** (모든 인덱스 포함)

### 4. 인덱스 유지보수
```sql
-- 정기적으로 통계 업데이트 (주 1회 권장)
ANALYZE keywords;

-- 인덱스 최적화 (월 1회 권장)
VACUUM;
```

---

## 📊 모니터링

### 인덱스 효과 측정

```sql
-- 쿼리 실행 시간 측정
.timer on

-- Before/After 비교
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;
```

### Turso 대시보드 확인
- **Rows Read** 지표 모니터링
- 인덱스 적용 후 **99% 이상 감소** 확인

---

## 🎯 결론

### 즉시 조치 필요
1. ✅ `idx_keyword_lookup` 생성
2. ✅ `idx_expand_candidates` 생성 (가장 중요!)
3. ✅ `idx_fill_docs_candidates` 생성 (가장 중요!)
4. ✅ `idx_has_docs` 생성

### 예상 효과
- **Rows Read**: 5억 회 → 수백만 회 (99% 감소)
- **쿼리 성능**: 수 초 → 수십 ms (95% 이상 개선)
- **서버 부하**: 대폭 감소

### 다음 단계
1. 인덱스 생성 후 24시간 모니터링
2. Rows Read 지표 확인
3. 필요 시 추가 인덱스 생성 (선택적 인덱스)

