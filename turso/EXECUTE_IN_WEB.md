# 🌐 웹 대시보드에서 인덱스 생성하기

Turso CLI 설치 없이 **웹 대시보드에서 직접 실행**하는 방법입니다.

---

## STEP 1: Turso 웹 대시보드 접속

1. https://turso.tech 접속
2. 로그인
3. 데이터베이스 `nkeword-igeonu377` 선택

---

## STEP 2: SQL Editor 열기

좌측 메뉴에서 **"SQL Editor"** 클릭

---

## STEP 3: 인덱스 생성 (하나씩 순서대로 실행)

### ⚡ STEP 1: 중복 체크 최적화 (1-2분)

```sql
CREATE INDEX IF NOT EXISTS idx_keyword_lookup ON keywords (keyword);
```

**실행 후**: "Query executed successfully" 메시지 확인

---

### 🔥 STEP 2: 확장 대상 조회 최적화 (3-5분) - 가장 중요!

```sql
CREATE INDEX IF NOT EXISTS idx_expand_candidates 
ON keywords (is_expanded, total_search_cnt DESC);
```

**실행 후**: 완료될 때까지 대기 (가장 오래 걸림)

---

### 🔥 STEP 3: 문서 수 채우기 최적화 (3-5분) - 가장 중요!

```sql
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NULL;
```

**만약 에러 발생 시** (Partial Index 미지원):
```sql
CREATE INDEX IF NOT EXISTS idx_fill_docs_candidates 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

---

### ⚡ STEP 4: 필터링 + 정렬 최적화 (3-5분)

```sql
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC)
WHERE total_doc_cnt IS NOT NULL;
```

**만약 에러 발생 시**:
```sql
CREATE INDEX IF NOT EXISTS idx_has_docs 
ON keywords (total_doc_cnt, total_search_cnt DESC);
```

---

### ⚡ STEP 5: 시간 범위 통계 최적화 (2-3분)

```sql
CREATE INDEX IF NOT EXISTS idx_created_at_range ON keywords (created_at);
```

---

### ✅ STEP 6: 통계 업데이트

```sql
ANALYZE keywords;
```

---

## STEP 4: 완료 확인

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

## ⚠️ 주의사항

1. **하나씩 순서대로 실행**: 한 번에 모두 실행하면 타임아웃될 수 있습니다
2. **완료될 때까지 대기**: 각 인덱스 생성은 1-5분 소요됩니다
3. **에러 발생 시**: Partial Index 에러가 나면 WHERE 절을 제거한 버전으로 재시도

---

## 📊 예상 소요 시간

- **총 소요 시간**: 약 15-25분 (80만 행 기준)
- **각 인덱스**: 1-5분

---

## 🎉 완료!

모든 인덱스가 생성되면 Turso 대시보드에서 **Rows Read 지표가 99% 감소**하는 것을 확인할 수 있습니다!

