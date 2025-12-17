-- =============================================================================
-- 단계별 인덱스 생성 가이드
-- =============================================================================
-- 각 단계를 순서대로 실행하세요.
-- 각 단계 후 .timer on 으로 성능을 측정할 수 있습니다.
-- =============================================================================

-- =============================================================================
-- STEP 0: 현재 상태 확인
-- =============================================================================

-- 현재 인덱스 목록 확인
SELECT 
    name as index_name,
    sql
FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;

-- 테이블 통계 확인
SELECT COUNT(*) as total_keywords FROM keywords;
SELECT COUNT(*) as pending_expand FROM keywords WHERE is_expanded = 0;
SELECT COUNT(*) as pending_docs FROM keywords WHERE total_doc_cnt IS NULL;

-- =============================================================================
-- STEP 1: 중복 체크 최적화 (가장 기본, 가장 빠르게 생성)
-- =============================================================================
-- 우선순위: 🔴 최우선
-- 예상 소요 시간: 1-2분
-- 영향: WHERE keyword = ? 쿼리 최적화

CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- 검증
EXPLAIN QUERY PLAN
SELECT id FROM keywords WHERE keyword = '테스트키워드';

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_keyword_lookup"

-- =============================================================================
-- STEP 2: 확장 대상 조회 최적화 (가장 중요!)
-- =============================================================================
-- 우선순위: 🔴 최우선
-- 예상 소요 시간: 3-5분
-- 영향: WHERE is_expanded = 0 AND total_search_cnt >= ? ORDER BY total_search_cnt DESC
-- 효과: 80만 행 → 수백 행만 스캔

CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- 검증
EXPLAIN QUERY PLAN
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_expand_candidates"

-- 성능 측정 (선택사항)
.timer on
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE is_expanded = 0 AND total_search_cnt >= 1000 
ORDER BY total_search_cnt DESC 
LIMIT 100;

-- =============================================================================
-- STEP 3: 문서 수 채우기 최적화 (가장 중요!)
-- =============================================================================
-- 우선순위: 🔴 최우선
-- 예상 소요 시간: 3-5분
-- 영향: WHERE total_doc_cnt IS NULL ORDER BY total_search_cnt DESC
-- 효과: 80만 행 → 수백 행만 스캔

-- Partial Index 사용 (SQLite 3.8.0+)
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- 만약 Partial Index가 지원되지 않으면 아래 사용:
-- CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
-- ON keywords (total_doc_cnt, total_search_cnt DESC);

-- 검증
EXPLAIN QUERY PLAN
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE total_doc_cnt IS NULL 
ORDER BY total_search_cnt DESC 
LIMIT 100;

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_fill_docs_candidates"

-- 성능 측정 (선택사항)
.timer on
SELECT id, keyword, total_search_cnt 
FROM keywords 
WHERE total_doc_cnt IS NULL 
ORDER BY total_search_cnt DESC 
LIMIT 100;

-- =============================================================================
-- STEP 4: 필터링 + 정렬 최적화
-- =============================================================================
-- 우선순위: 🟡 높음
-- 예상 소요 시간: 3-5분
-- 영향: WHERE total_doc_cnt IS NOT NULL ORDER BY ...
-- 효과: 사용자 조회 쿼리 최적화

CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- 만약 Partial Index가 지원되지 않으면 아래 사용:
-- CREATE INDEX IF NOT EXISTS idx_has_docs 
-- ON keywords (total_doc_cnt, total_search_cnt DESC);

-- 검증
EXPLAIN QUERY PLAN
SELECT * FROM keywords 
WHERE total_doc_cnt IS NOT NULL 
ORDER BY total_search_cnt DESC 
LIMIT 50;

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_has_docs"

-- =============================================================================
-- STEP 5: 시간 범위 통계 최적화
-- =============================================================================
-- 우선순위: 🟢 중간
-- 예상 소요 시간: 2-3분
-- 영향: WHERE created_at >= ? / WHERE updated_at >= ?

CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);

-- 검증
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM keywords WHERE created_at >= datetime('now', '-1 day');

-- 예상 결과: "SEARCH TABLE keywords USING INDEX idx_created_at_range"

-- =============================================================================
-- STEP 6: 최종 확인
-- =============================================================================

-- 생성된 모든 인덱스 확인
SELECT 
    name as index_name,
    CASE 
        WHEN sql LIKE '%WHERE%' THEN 'Partial Index'
        ELSE 'Full Index'
    END as index_type,
    sql
FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;

-- 인덱스 크기 확인 (대략적)
SELECT 
    name,
    (SELECT COUNT(*) FROM keywords) as total_rows,
    '인덱스 생성 완료' as status
FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords' AND name LIKE 'idx_%'
ORDER BY name;

-- 통계 업데이트 (인덱스 사용 최적화)
ANALYZE keywords;

-- =============================================================================
-- STEP 7: 성능 비교 테스트 (선택사항)
-- =============================================================================

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

-- =============================================================================
-- 완료!
-- =============================================================================
-- 모든 필수 인덱스가 생성되었습니다.
-- Turso 대시보드에서 Rows Read 지표를 확인하여 개선 효과를 확인하세요.
-- =============================================================================

