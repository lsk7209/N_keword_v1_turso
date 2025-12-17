# 🚀 Turso CLI 설치 및 인덱스 생성 가이드

## 문제: Turso CLI가 설치되어 있지 않습니다

---

## STEP 1: Turso CLI 설치

### Windows (PowerShell)

```powershell
# 방법 1: 공식 설치 스크립트 (권장)
irm get.tur.so/install.ps1 | iex

# 방법 2: Scoop 사용 (Scoop이 설치되어 있는 경우)
scoop install turso

# 방법 3: 직접 다운로드
# https://github.com/tursodatabase/turso-cli/releases
```

### 설치 확인

```powershell
turso --version
```

**예상 출력**: `turso 1.x.x` (버전 번호)

---

## STEP 2: Turso 로그인

```powershell
turso auth login
```

브라우저가 열리면 Turso 계정으로 로그인하세요.

---

## STEP 3: 인덱스 생성 실행

설치가 완료되면 다음 명령어를 실행하세요:

```powershell
Get-Content turso/step_by_step_indexes.sql | turso db shell nkeword-igeonu377
```

또는:

```powershell
.\turso\RUN_THIS.ps1
```

---

## 대안: 웹 대시보드에서 직접 실행

Turso CLI 설치가 어려운 경우, Turso 웹 대시보드의 SQL Editor에서 직접 실행할 수 있습니다.

### 1. Turso 웹 대시보드 접속
- https://turso.tech 접속
- 로그인 후 데이터베이스 `nkeword-igeonu377` 선택

### 2. SQL Editor 열기
- 좌측 메뉴에서 "SQL Editor" 클릭

### 3. 아래 SQL을 복사하여 실행

```sql
-- STEP 1: 중복 체크 최적화 (1-2분)
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);

-- STEP 2: 확장 대상 조회 최적화 (3-5분) - 가장 중요!
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);

-- STEP 3: 문서 수 채우기 최적화 (3-5분) - 가장 중요!
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;

-- STEP 4: 필터링 + 정렬 최적화 (3-5분)
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;

-- STEP 5: 시간 범위 통계 최적화 (2-3분)
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);

-- STEP 6: 통계 업데이트
ANALYZE keywords;
```

**주의**: 각 인덱스를 하나씩 순서대로 실행하세요. 한 번에 모두 실행하면 타임아웃될 수 있습니다.

---

## 완료 확인

인덱스 생성이 완료되면 다음 쿼리로 확인:

```sql
SELECT name FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;
```

**확인해야 할 인덱스 (5개):**
- ✅ `idx_keyword_lookup`
- ✅ `idx_expand_candidates`
- ✅ `idx_fill_docs_candidates`
- ✅ `idx_has_docs`
- ✅ `idx_created_at_range`

---

## 예상 소요 시간

- **총 소요 시간**: 약 15-25분 (80만 행 기준)
- **각 인덱스**: 1-5분

