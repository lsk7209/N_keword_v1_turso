-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🔧 Turso DB 스키마 최적화: UNIQUE INDEX 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 목적: ON CONFLICT 절을 위한 필수 제약조건
-- 효과: INSERT/UPDATE 충돌 시 자동 처리, 중복 방지
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. 기존 인덱스 확인 (있으면 스킵)
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_keyword 
ON keywords(keyword);

-- 2. 검증 쿼리 (실행 후 확인용)
-- SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='keywords';
