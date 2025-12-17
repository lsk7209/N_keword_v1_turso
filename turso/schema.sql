-- Turso (SQLite) 스키마
-- PostgreSQL -> SQLite 변환

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,  -- UUID는 TEXT로 저장
  keyword TEXT UNIQUE NOT NULL,
  total_search_cnt INTEGER DEFAULT 0,
  pc_search_cnt INTEGER DEFAULT 0,
  mo_search_cnt INTEGER DEFAULT 0,
  click_cnt INTEGER DEFAULT 0,
  pc_click_cnt INTEGER DEFAULT 0,
  mo_click_cnt INTEGER DEFAULT 0,
  total_ctr REAL DEFAULT 0,  -- 전체 평균 CTR
  pc_ctr REAL DEFAULT 0,       -- PC CTR
  mo_ctr REAL DEFAULT 0,       -- 모바일 CTR
  ctr REAL DEFAULT 0,  -- 레거시 필드 (호환성 유지)
  comp_idx TEXT,
  pl_avg_depth INTEGER DEFAULT 0,
  avg_bid_price INTEGER DEFAULT 0,
  total_doc_cnt INTEGER,  -- NULL implies uncollected
  blog_doc_cnt INTEGER DEFAULT 0,
  cafe_doc_cnt INTEGER DEFAULT 0,
  web_doc_cnt INTEGER DEFAULT 0,
  news_doc_cnt INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'UNRANKED',
  golden_ratio REAL DEFAULT 0,
  is_expanded INTEGER DEFAULT 0,  -- boolean -> INTEGER (0/1)
  created_at TEXT DEFAULT (datetime('now')),  -- timestamptz -> TEXT (ISO 8601)
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Indexes
-- =============================================================================
-- 기존 인덱스 (정렬 및 필터링용)
CREATE INDEX IF NOT EXISTS idx_keywords_tier_ratio ON keywords (tier, golden_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_search_desc ON keywords (total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_cafe_opp ON keywords (cafe_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_blog_opp ON keywords (blog_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_web_opp ON keywords (web_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_updated_at ON keywords (updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_ctr_desc ON keywords (total_ctr DESC);
CREATE INDEX IF NOT EXISTS idx_pc_ctr_desc ON keywords (pc_ctr DESC);
CREATE INDEX IF NOT EXISTS idx_mo_ctr_desc ON keywords (mo_ctr DESC);

-- =============================================================================
-- 필수 인덱스 (Full Table Scan 방지 - 최우선)
-- =============================================================================
-- 1. 중복 체크 최적화 (WHERE keyword = ?)
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- 2. 확장 대상 조회 최적화 (WHERE is_expanded = 0 AND total_search_cnt >= ? ORDER BY total_search_cnt DESC)
--    가장 빈번한 쿼리 중 하나 - 반드시 필요!
CREATE INDEX IF NOT EXISTS idx_expand_candidates ON keywords (is_expanded, total_search_cnt DESC);

-- 3. 문서 수 채우기 최적화 (WHERE total_doc_cnt IS NULL ORDER BY total_search_cnt DESC)
--    가장 빈번한 쿼리 중 하나 - 반드시 필요!
--    Partial Index 사용 (SQLite 3.8.0+)
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- 4. 필터링 + 정렬 최적화 (WHERE total_doc_cnt IS NOT NULL ORDER BY ...)
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- 5. 시간 범위 통계 최적화 (WHERE created_at >= ?)
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);

-- Settings 테이블 (mining_mode 등 설정 저장용)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON 문자열로 저장
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);

