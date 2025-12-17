-- =============================================================================
-- Turso 데이터베이스 테이블 생성 (인덱스 생성 전 필수)
-- =============================================================================
-- 먼저 이 스크립트를 실행하여 테이블을 생성하세요.
-- =============================================================================

-- Keywords 테이블 생성
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

-- Settings 테이블 생성
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON 문자열로 저장
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 테이블 생성 확인
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('keywords', 'settings');

-- 완료 메시지
SELECT 'Tables created successfully!' as status;

