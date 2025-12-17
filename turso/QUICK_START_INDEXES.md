# 🚀 인덱스 최적화 빠른 시작 가이드

## ⚡ 즉시 실행 (필수 인덱스만)

80만 개 이상의 키워드 데이터에서 **Rows Read 폭증 문제**를 해결하기 위한 필수 인덱스입니다.

### 실행 방법

```bash
# 방법 1: 전체 최적화 스크립트 실행 (권장)
turso db shell your-database-name < turso/optimize_indexes.sql

# 방법 2: 필수 인덱스만 빠르게 생성
turso db shell your-database-name
```

그 다음 아래 SQL을 복사하여 실행:

```sql
-- =============================================================================
-- 필수 인덱스 (즉시 실행)
-- =============================================================================

-- 1. 중복 체크 최적화
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- 2. 확장 대상 조회 최적화 (가장 중요! - 5분마다 실행되는 쿼리)
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- 3. 문서 수 채우기 최적화 (가장 중요! - 5분마다 실행되는 쿼리)
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- 4. 필터링 + 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- 5. 시간 범위 통계
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);
```

### 예상 소요 시간
- **80만 행 기준**: 인덱스당 1-5분
- **총 소요 시간**: 약 5-25분

### 예상 효과
- **Rows Read**: **99% 감소** (800,000 → 1,000)
- **쿼리 시간**: **95% 이상 개선** (500ms → 10ms)

---

## 📋 상세 분석은 다음 문서 참고

- **전체 리포트**: `turso/INDEX_OPTIMIZATION_REPORT.md`
- **최적화 스크립트**: `turso/optimize_indexes.sql`

