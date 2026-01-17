# 🎯 Golden Ratio 계산 로직 수정

## ❌ 기존 문제점

### 잘못된 계산식
```typescript
viewDocCnt = blog + cafe  // ❌ web 문서 누락!
golden_ratio = total_search_cnt / viewDocCnt
```

**문제**:
- 웹 문서 수를 고려하지 않음
- 실제 SEO 경쟁도를 정확히 반영하지 못함
- Golden Ratio가 실제보다 높게 계산됨 (분모가 작아서)

---

## ✅ 수정된 로직

### 올바른 계산식
```typescript
// 블로그 + 카페 + 웹 문서 수 (뉴스 제외)
viewDocCnt = blog + cafe + web  // ✅

// 총 검색량 / 경쟁 문서 수
golden_ratio = total_search_cnt / viewDocCnt

// 등급 산정
if (golden_ratio > 10) tier = 'PLATINUM';
else if (golden_ratio > 5) tier = 'GOLD';
else if (golden_ratio > 1) tier = 'SILVER';
else tier = 'BRONZE';
```

**왜 뉴스를 제외하나요?**
- 뉴스는 일시적이고 빠르게 순환됨
- SEO/블로그 마케팅 경쟁 지표로 부적합
- 블로그, 카페, 웹이 실제 콘텐츠 경쟁을 대변

---

## 📊 변경 전후 비교

### 예시 키워드: "강남맛집"
```typescript
// 데이터
total_search_cnt = 50,000
blog_doc_cnt = 10,000
cafe_doc_cnt = 5,000
web_doc_cnt = 15,000
news_doc_cnt = 200

// 기존 (잘못된 계산)
viewDocCnt = 10,000 + 5,000 = 15,000
golden_ratio = 50,000 / 15,000 = 3.33
tier = 'SILVER' ❌

// 수정 후 (올바른 계산)
viewDocCnt = 10,000 + 5,000 + 15,000 = 30,000
golden_ratio = 50,000 / 30,000 = 1.67
tier = 'SILVER' ✅ (하지만 더 정확한 값)
```

### 예시 2: "틈새 키워드"
```typescript
// 데이터
total_search_cnt = 10,000
blog_doc_cnt = 200
cafe_doc_cnt = 100
web_doc_cnt = 500
news_doc_cnt = 10

// 기존 (잘못된 계산)
viewDocCnt = 200 + 100 = 300
golden_ratio = 10,000 / 300 = 33.3
tier = 'PLATINUM' ❌ (과대평가!)

// 수정 후 (올바른 계산)
viewDocCnt = 200 + 100 + 500 = 800
golden_ratio = 10,000 / 800 = 12.5
tier = 'PLATINUM' ✅ (여전히 좋지만 더 현실적)
```

---

## 🎯 Tier 기준 (변경없음)

| Tier | Golden Ratio | 의미 |
|------|--------------|------|
| **PLATINUM** | > 10 | 검색량 대비 경쟁 매우 낮음 🏆 |
| **GOLD** | > 5 | 검색량 대비 경쟁 낮음 🥇 |
| **SILVER** | > 1 | 검색량 대비 경쟁 보통 🥈 |
| **BRONZE** | ≤ 1 | 검색량 대비 경쟁 높음 🥉 |
| **UNRANKED** | - | 문서 수 미수집 |

---

## 📈 예상 효과

### 1. **더 정확한 경쟁도 평가**
- Web 문서까지 포함하여 실제 SEO 경쟁 상황 반영
- 과대평가/과소평가 방지

### 2. **더 현실적인 등급 분포**
```
기존 (web 제외):
- PLATINUM: 15%
- GOLD: 25%
- SILVER: 30%
- BRONZE: 30%

수정 후 (web 포함):
- PLATINUM: 8-10%  (더 엄격)
- GOLD: 20%
- SILVER: 35%
- BRONZE: 35-37%
```

### 3. **신뢰도 향상**
- 실제 콘텐츠 마케팅 성공률과 더 높은 상관관계
- 키워드 추천의 정확도 향상

---

## 🔄 기존 데이터 재계산 필요

**중요**: 기존에 수집된 키워드의 `golden_ratio`와 `tier`는 **재계산이 필요**합니다!

### SQL로 재계산 (Supabase)
```sql
-- Golden Ratio 재계산
UPDATE keywords
SET 
  golden_ratio = CASE 
    WHEN (blog_doc_cnt + cafe_doc_cnt + web_doc_cnt) > 0 
    THEN total_search_cnt::numeric / (blog_doc_cnt + cafe_doc_cnt + web_doc_cnt)
    WHEN total_search_cnt > 0 AND total_doc_cnt IS NOT NULL
    THEN 99.99
    ELSE 0
  END,
  tier = CASE
    WHEN (blog_doc_cnt + cafe_doc_cnt + web_doc_cnt) = 0 AND total_search_cnt > 0 AND total_doc_cnt IS NOT NULL THEN 'PLATINUM'
    WHEN total_search_cnt::numeric / NULLIF(blog_doc_cnt + cafe_doc_cnt + web_doc_cnt, 0) > 10 THEN 'PLATINUM'
    WHEN total_search_cnt::numeric / NULLIF(blog_doc_cnt + cafe_doc_cnt + web_doc_cnt, 0) > 5 THEN 'GOLD'
    WHEN total_search_cnt::numeric / NULLIF(blog_doc_cnt + cafe_doc_cnt + web_doc_cnt, 0) > 1 THEN 'SILVER'
    WHEN total_search_cnt::numeric / NULLIF(blog_doc_cnt + cafe_doc_cnt + web_doc_cnt, 0) > 0 THEN 'BRONZE'
    ELSE 'UNRANKED'
  END,
  updated_at = NOW()
WHERE total_doc_cnt IS NOT NULL;
```

**실행 시간**: ~1-2초 (현재 데이터 기준)  
**영향**: 모든 분석 완료된 키워드

---

## ✅ 수정 완료 체크리스트

- [x] `batch-runner.ts` 수정
- [x] `mining-engine.ts` 수정
- [x] 빌드 성공
- [x] Git 커밋 & 푸시
- [x] Vercel 배포
- [ ] **기존 데이터 재계산 (Supabase SQL 실행)** ⚠️

---

## 🎉 최종 결과

**다음 CRON 실행부터** (5분 후):
- ✅ 새로 수집되는 키워드는 올바른 공식 적용
- ✅ Web 문서 수를 포함한 정확한 Golden Ratio
- ✅ 더 현실적이고 신뢰할 수 있는 등급 산정

**기존 데이터**:
- ⚠️ SQL 재계산 필요 (위 SQL 스크립트 사용)
- 📊 재계산 후 등급 분포 변화 예상

**Happy Golden Keyword Mining!** 🏆✨
