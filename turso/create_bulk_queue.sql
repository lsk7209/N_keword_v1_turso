-- =============================================================================
-- Bulk Queue 테이블 생성 (대량 키워드 백그라운드 처리용)
-- =============================================================================

CREATE TABLE IF NOT EXISTS bulk_queue (
  id TEXT PRIMARY KEY,
  seeds TEXT NOT NULL,           -- JSON array of seed keywords
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  total_seeds INTEGER DEFAULT 0,
  processed_seeds INTEGER DEFAULT 0,
  result_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 인덱스: 상태별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_bulk_queue_status ON bulk_queue(status);
CREATE INDEX IF NOT EXISTS idx_bulk_queue_created ON bulk_queue(created_at);

-- 확인
SELECT 'bulk_queue table created!' as status;
