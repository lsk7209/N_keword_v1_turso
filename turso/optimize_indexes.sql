-- =============================================================================
-- Turso 데이터베이스 인덱스 최적화 스크립트
-- =============================================================================
-- 목적: 80만+ 키워드 데이터에서 Full Table Scan 방지 및 쿼리 성능 최적화
-- 실행 방법: turso db shell your-database-name < turso/optimize_indexes.sql
-- =============================================================================

-- =============================================================================
-- 1. 원인 분석: Full Table Scan이 발생하는 쿼리 패턴
-- =============================================================================

-- ❌ 문제 1: 중복 체크 쿼리 (가장 빈번함)
--    WHERE keyword = ?
--    → keyword는 UNIQUE 제약이 있어 자동 인덱스가 있지만, 명시적 인덱스 권장

-- ❌ 문제 2: 확장 대상 조회 (매 5분마다 실행, 매우 빈번)
--    WHERE is_expanded = 0 AND total_search_cnt >= ? ORDER BY total_search_cnt DESC
--    → is_expanded에 인덱스 없음 + 복합 조건으로 인한 Full Scan

-- ❌ 문제 3: 문서 수 채우기 (매 5분마다 실행, 매우 빈번)
--    WHERE total_doc_cnt IS NULL ORDER BY total_search_cnt DESC
--    → total_doc_cnt에 인덱스 없음 + NULL 체크 + 정렬로 인한 Full Scan

-- ❌ 문제 4: 필터링 + 정렬 (사용자 조회 시 빈번)
--    WHERE total_doc_cnt IS NOT NULL ORDER BY ...
--    → total_doc_cnt에 인덱스 없음

-- ❌ 문제 5: 시간 기반 통계 (모니터링)
--    WHERE created_at >= ? / WHERE updated_at >= ?
--    → 인덱스는 있지만 복합 쿼리와 함께 사용 시 최적화 필요

-- =============================================================================
-- 2. 필수 인덱스 생성 (우선순위 순)
-- =============================================================================

-- =============================================================================
-- 2-1. 중복 체크 최적화 (최우선)
-- =============================================================================
-- 쿼리: WHERE keyword = ?
-- 빈도: 매우 높음 (키워드 삽입/업데이트 시마다 실행)
-- 효과: O(log n) → O(1)에 가까운 조회 속도
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- =============================================================================
-- 2-2. 확장 대상 조회 최적화 (최우선 - 복합 인덱스)
-- =============================================================================
-- 쿼리: WHERE is_expanded = 0 AND total_search_cnt >= ? ORDER BY total_search_cnt DESC
-- 빈도: 매우 높음 (5분마다 자동 실행)
-- 효과: Full Table Scan → Index Scan (80만 행 → 수백 행만 스캔)
-- 
-- 인덱스 설계 원칙:
-- 1. WHERE 조건 컬럼을 먼저 (is_expanded)
-- 2. 범위 조건 컬럼을 두 번째 (total_search_cnt)
-- 3. ORDER BY 컬럼을 마지막 (total_search_cnt DESC - 이미 포함되어 있음)
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- =============================================================================
-- 2-3. 문서 수 채우기 최적화 (최우선 - 복합 인덱스)
-- =============================================================================
-- 쿼리: WHERE total_doc_cnt IS NULL ORDER BY total_search_cnt DESC
-- 빈도: 매우 높음 (5분마다 자동 실행)
-- 효과: Full Table Scan → Index Scan
--
-- SQLite의 NULL 처리:
-- - IS NULL 조건은 인덱스에서 효율적으로 처리됨
-- - 하지만 NULL 값이 많은 경우 부분 인덱스(Partial Index)가 더 효율적
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;  -- Partial Index (SQLite 3.8.0+)

-- Partial Index가 지원되지 않는 경우 대안:
-- CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
-- ON keywords (total_doc_cnt, total_search_cnt DESC);

-- =============================================================================
-- 2-4. 필터링 + 정렬 최적화 (높은 우선순위)
-- =============================================================================
-- 쿼리: WHERE total_doc_cnt IS NOT NULL ORDER BY ...
-- 빈도: 높음 (사용자 조회 시마다 실행)
-- 효과: Full Table Scan → Index Scan
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;  -- Partial Index

-- 대안 (Partial Index 미지원 시):
-- CREATE INDEX IF NOT EXISTS idx_has_docs 
-- ON keywords (total_doc_cnt, total_search_cnt DESC);

-- =============================================================================
-- 2-5. 시간 기반 통계 최적화 (중간 우선순위)
-- =============================================================================
-- 쿼리: WHERE created_at >= ? / WHERE updated_at >= ?
-- 빈도: 중간 (모니터링 대시보드)
-- 효과: 시간 범위 쿼리 최적화
--
-- 참고: 이미 idx_updated_at이 있지만, 복합 쿼리를 위해 추가 최적화
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);
-- idx_updated_at은 이미 존재 (스키마에 포함)

-- =============================================================================
-- 2-6. 기존 인덱스 검증 및 최적화
-- =============================================================================
-- 다음 인덱스들은 이미 존재하지만, 사용 패턴에 맞게 검증 필요:

-- ✅ idx_keywords_tier_ratio: tier + golden_ratio 정렬용 (유지)
-- ✅ idx_search_desc: total_search_cnt 정렬용 (유지)
-- ✅ idx_cafe_opp, idx_blog_opp, idx_web_opp: 기회 키워드 찾기용 (유지)
-- ✅ idx_updated_at: 시간 기반 정렬용 (유지)
-- ✅ idx_ctr_desc, idx_pc_ctr_desc, idx_mo_ctr_desc: CTR 정렬용 (유지)

-- =============================================================================
-- 3. 복합 인덱스 추가 최적화 (선택적)
-- =============================================================================

-- =============================================================================
-- 3-1. 등급별 + 비율 정렬 최적화
-- =============================================================================
-- 쿼리: WHERE total_doc_cnt IS NOT NULL ORDER BY tier ASC, golden_ratio DESC
-- 빈도: 높음 (사용자 조회)
-- 효과: 기존 idx_keywords_tier_ratio와 함께 사용 시 최적화
-- 
-- 참고: 이미 idx_keywords_tier_ratio가 있지만, 
--       total_doc_cnt 필터링과 함께 사용 시 추가 인덱스 고려
CREATE INDEX IF NOT EXISTS idx_tier_ratio_with_docs 
ON keywords (total_doc_cnt, tier, golden_ratio DESC)
WHERE total_doc_cnt IS NOT NULL;

-- =============================================================================
-- 3-2. 문서 수별 기회 키워드 찾기 (기존 인덱스 보완)
-- =============================================================================
-- 쿼리: WHERE total_doc_cnt IS NOT NULL ORDER BY cafe_doc_cnt ASC, total_search_cnt DESC
-- 빈도: 중간 (사용자 조회)
-- 
-- 참고: 기존 idx_cafe_opp가 있지만, total_doc_cnt 필터링 추가 시 최적화
CREATE INDEX IF NOT EXISTS idx_cafe_opp_with_docs 
ON keywords (total_doc_cnt, cafe_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blog_opp_with_docs 
ON keywords (total_doc_cnt, blog_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_opp_with_docs 
ON keywords (total_doc_cnt, web_doc_cnt ASC, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- =============================================================================
-- 4. 인덱스 사용 통계 확인 (실행 후 검증용)
-- =============================================================================
-- 다음 쿼리로 인덱스 사용 여부 확인:
-- 
-- EXPLAIN QUERY PLAN
-- SELECT id, keyword, total_search_cnt 
-- FROM keywords 
-- WHERE is_expanded = 0 AND total_search_cnt >= 1000 
-- ORDER BY total_search_cnt DESC 
-- LIMIT 100;
--
-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_expand_candidates"
--
-- EXPLAIN QUERY PLAN
-- SELECT id, keyword, total_search_cnt 
-- FROM keywords 
-- WHERE total_doc_cnt IS NULL 
-- ORDER BY total_search_cnt DESC 
-- LIMIT 100;
--
-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_fill_docs_candidates"

-- =============================================================================
-- 5. 인덱스 유지보수 권장사항
-- =============================================================================
-- 
-- 1. 정기적인 ANALYZE 실행 (통계 업데이트)
--    ANALYZE keywords;
--
-- 2. 인덱스 크기 모니터링
--    SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='keywords';
--
-- 3. 사용하지 않는 인덱스 제거 (선택적)
--    DROP INDEX IF EXISTS idx_unused_index;
--
-- 4. VACUUM 실행 (인덱스 최적화, 주기적으로)
--    VACUUM;

-- =============================================================================
-- 6. 성능 측정 (Before/After)
-- =============================================================================
-- 
-- 인덱스 생성 전:
-- - Rows Read: ~800,000 (Full Table Scan)
-- - 쿼리 시간: 수백 ms ~ 수 초
--
-- 인덱스 생성 후 예상:
-- - Rows Read: ~100-1,000 (Index Scan)
-- - 쿼리 시간: 수 ms ~ 수십 ms
--
-- 측정 방법:
-- .timer on
-- SELECT id, keyword, total_search_cnt 
-- FROM keywords 
-- WHERE is_expanded = 0 AND total_search_cnt >= 1000 
-- ORDER BY total_search_cnt DESC 
-- LIMIT 100;

