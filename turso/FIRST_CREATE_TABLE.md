# ⚠️ 테이블이 없습니다!

## 문제
`no such table: main.keywords` 에러가 발생했습니다.

이는 **keywords 테이블이 아직 생성되지 않았다**는 의미입니다.

---

## 해결 방법: 먼저 테이블 생성

### 웹 대시보드에서 실행

1. https://turso.tech 접속 → 로그인
2. 데이터베이스 `nkeword-igeonu377` 선택
3. 좌측 메뉴에서 **"SQL Editor"** 클릭
4. 아래 SQL을 실행:

```sql
-- Keywords 테이블 생성
CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT UNIQUE NOT NULL,
  total_search_cnt INTEGER DEFAULT 0,
  pc_search_cnt INTEGER DEFAULT 0,
  mo_search_cnt INTEGER DEFAULT 0,
  click_cnt INTEGER DEFAULT 0,
  pc_click_cnt INTEGER DEFAULT 0,
  mo_click_cnt INTEGER DEFAULT 0,
  total_ctr REAL DEFAULT 0,
  pc_ctr REAL DEFAULT 0,
  mo_ctr REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  comp_idx TEXT,
  pl_avg_depth INTEGER DEFAULT 0,
  avg_bid_price INTEGER DEFAULT 0,
  total_doc_cnt INTEGER,
  blog_doc_cnt INTEGER DEFAULT 0,
  cafe_doc_cnt INTEGER DEFAULT 0,
  web_doc_cnt INTEGER DEFAULT 0,
  news_doc_cnt INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'UNRANKED',
  golden_ratio REAL DEFAULT 0,
  is_expanded INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Settings 테이블 생성
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 테이블 생성 확인
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('keywords', 'settings');
```

---

## 테이블 생성 확인

다음 쿼리로 테이블이 생성되었는지 확인:

```sql
SELECT name FROM sqlite_master WHERE type='table';
```

**확인해야 할 테이블:**
- ✅ `keywords`
- ✅ `settings`

---

## 다음 단계

테이블 생성이 완료되면 **인덱스 생성**을 진행하세요:

1. `turso/EXECUTE_IN_WEB.md` 파일 참고
2. 또는 아래 인덱스 생성 SQL 실행:

```sql
-- STEP 1: 중복 체크 최적화
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- STEP 2: 확장 대상 조회 최적화
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- STEP 3: 문서 수 채우기 최적화
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- STEP 4: 필터링 + 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- STEP 5: 시간 범위 통계 최적화
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);

-- STEP 6: 통계 업데이트
ANALYZE keywords;
```

---

## 중요 참고사항

### 기존 데이터가 있는 경우

만약 **Supabase에서 데이터를 마이그레이션**해야 한다면:

1. 먼저 테이블 생성 (위 SQL 실행)
2. `scripts/migrate-to-turso.ts` 스크립트 실행하여 데이터 마이그레이션
3. 그 다음 인덱스 생성

### 새로 시작하는 경우

1. 테이블 생성 (위 SQL 실행)
2. 인덱스 생성 (위 인덱스 SQL 실행)
3. 애플리케이션에서 데이터 수집 시작

---

## 순서 요약

1. ✅ **테이블 생성** (지금 해야 할 일)
2. ⏭️ 데이터 마이그레이션 (기존 데이터가 있는 경우)
3. ⏭️ **인덱스 생성** (테이블 생성 후)

