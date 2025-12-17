-- D1 Database Schema (SQLite)
-- Cloudflare D1 for Golden Keyword Miner

-- Keywords table
CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  keyword TEXT UNIQUE NOT NULL,
  total_search_cnt INTEGER DEFAULT 0,
  pc_search_cnt INTEGER DEFAULT 0,
  mo_search_cnt INTEGER DEFAULT 0,
  click_cnt INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  comp_idx TEXT,
  pl_avg_depth INTEGER DEFAULT 0,
  avg_bid_price INTEGER DEFAULT 0,
  total_doc_cnt INTEGER, -- NULL implies uncollected
  blog_doc_cnt INTEGER DEFAULT 0,
  cafe_doc_cnt INTEGER DEFAULT 0,
  web_doc_cnt INTEGER DEFAULT 0,
  news_doc_cnt INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'UNRANKED',
  golden_ratio REAL DEFAULT 0,
  is_expanded INTEGER DEFAULT 0, -- SQLite uses INTEGER for boolean (0/1)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_keywords_tier_ratio ON keywords (tier, golden_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_search_desc ON keywords (total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_cafe_opp ON keywords (cafe_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_blog_opp ON keywords (blog_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_web_opp ON keywords (web_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX IF NOT EXISTS idx_updated_at ON keywords (updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_keyword_text ON keywords (keyword);

