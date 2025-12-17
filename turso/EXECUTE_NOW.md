# 🚀 지금 바로 실행하기

## 당신의 데이터베이스 정보
- **데이터베이스 이름**: `nkeword-igeonu377`
- **URL**: `libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io`
- **토큰**: 설정 완료

---

## ⚡ 빠른 실행 (3가지 방법 중 선택)

### 방법 1: PowerShell 스크립트 실행 (Windows 권장)

```powershell
.\turso\create_indexes_now.ps1
```

### 방법 2: Turso CLI 직접 실행

```bash
turso db shell nkeword-igeonu377 < turso/step_by_step_indexes.sql
```

### 방법 3: Turso Shell에서 단계별 실행

```bash
# 1. Turso Shell 접속
turso db shell nkeword-igeonu377
```

그 다음 아래 SQL을 순서대로 실행:

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

-- 확인
SELECT name FROM sqlite_master 
WHERE type='index' AND tbl_name='keywords'
ORDER BY name;
```

---

## 📊 예상 소요 시간

- **총 소요 시간**: 약 15-25분 (80만 행 기준)
- **각 인덱스**: 1-5분

---

## ✅ 완료 확인

인덱스 생성이 완료되면 다음을 확인하세요:

```sql
-- 생성된 인덱스 확인
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

## 🎯 다음 단계

1. **24시간 후**: Turso 대시보드에서 Rows Read 지표 확인
2. **애플리케이션 테스트**: 자동 채굴 작업이 정상 실행되는지 확인

---

## 🆘 문제 발생 시

### Partial Index 에러가 나면

```sql
-- WHERE 절 제거하고 다시 실행
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC);

CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

### 인덱스 생성이 너무 오래 걸리면

- 정상: 80만 행 기준 인덱스당 1-5분
- 10분 이상 소요 시 중단 후 재시도

