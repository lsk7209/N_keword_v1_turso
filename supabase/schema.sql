-- Enable pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE keywords (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text UNIQUE NOT NULL, 
  total_search_cnt int4 DEFAULT 0,
  pc_search_cnt int4 DEFAULT 0,
  mo_search_cnt int4 DEFAULT 0,
  click_cnt int4 DEFAULT 0,
  ctr numeric DEFAULT 0,
  comp_idx text,
  pl_avg_depth int4 DEFAULT 0,
  avg_bid_price int4 DEFAULT 0,
  total_doc_cnt int4, -- NULL implies uncollected
  blog_doc_cnt int4 DEFAULT 0,
  cafe_doc_cnt int4 DEFAULT 0,
  web_doc_cnt int4 DEFAULT 0,
  news_doc_cnt int4 DEFAULT 0,
  tier text DEFAULT 'UNRANKED',
  golden_ratio numeric DEFAULT 0,
  is_expanded boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_keywords_tier_ratio ON keywords (tier, golden_ratio DESC);
CREATE INDEX idx_search_desc ON keywords (total_search_cnt DESC);
CREATE INDEX idx_cafe_opp ON keywords (cafe_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX idx_blog_opp ON keywords (blog_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX idx_web_opp ON keywords (web_doc_cnt ASC, total_search_cnt DESC);
CREATE INDEX idx_updated_at ON keywords (updated_at ASC);
