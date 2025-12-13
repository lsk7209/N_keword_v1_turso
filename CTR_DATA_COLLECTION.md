# 🎯 CTR 데이터 수집 추가 완료!

## ✅ 추가된 데이터 필드

### 기존 수집 항목
- ✅ relKeyword → `keyword`
- ✅ monthlyPcQcCnt → `pc_search_cnt`
- ✅ monthlyMobileQcCnt → `mo_search_cnt`
- ✅ monthlyAvePcClkCnt + monthlyAveMobileClkCnt → `click_cnt` (합계)
- ✅ compIdx → `comp_idx`
- ✅ plAvgDepth → `pl_avg_depth`

### 새로 추가된 항목 🆕
- 🆕 monthlyAvePcClkCnt → `pc_click_cnt` (PC 개별 클릭 수)
- 🆕 monthlyAveMobileClkCnt → `mo_click_cnt` (모바일 개별 클릭 수)
- 🆕 monthlyAvePcCtr → `pc_ctr` (PC 클릭률)
- 🆕 monthlyAveMobileCtr → `mo_ctr` (모바일 클릭률)
- 🆕 평균 → `total_ctr` (전체 평균 CTR)

---

## 📊 수집 데이터 예시

```typescript
{
  keyword: "강남맛집",
  
  // 검색량
  total_search_cnt: 50000,
  pc_search_cnt: 20000,
  mo_search_cnt: 30000,
  
  // 클릭 수
  click_cnt: 5000,        // 합계
  pc_click_cnt: 2000,     // 🆕 PC 개별
  mo_click_cnt: 3000,     // 🆕 모바일 개별
  
  // CTR (클릭률)
  total_ctr: 12.5,       // 🆕 평균
  pc_ctr: 10.0,          // 🆕 PC
  mo_ctr: 15.0,          // 🆕 모바일
  
  // 경쟁도
  comp_idx: "높음",
  pl_avg_depth: 8
}
```

---

## 🔧 필수 작업: Supabase 마이그레이션

### ⚠️ 중요: DB 스키마 업데이트 필요!

코드는 이미 배포되었지만, **Supabase 데이터베이스에 새 컬럼을 추가**해야 합니다.

#### 방법 1: SQL Editor에서 실행 (권장)

1. [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/vtpkmwwehvvsypzfwwtr/sql)로 이동
2. `supabase/migration_add_ctr.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기
4. "Run" 버튼 클릭

#### SQL 미리보기:
```sql
-- CTR 필드 추가
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS pc_click_cnt int4 DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS mo_click_cnt int4 DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS total_ctr numeric DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS pc_ctr numeric DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS mo_ctr numeric DEFAULT 0;

-- CTR 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_ctr_desc ON keywords (total_ctr DESC);
CREATE INDEX IF NOT EXISTS idx_pc_ctr_desc ON keywords (pc_ctr DESC);
CREATE INDEX IF NOT EXISTS idx_mo_ctr_desc ON keywords (mo_ctr DESC);
```

⏱️ **예상 소요 시간**: 1-2초 (서비스 중단 없음)

---

## 📈 CTR 데이터 활용 방안

### 1. 광고 효율 분석
- **높은 CTR** → 광고 경쟁 낮고 사용자 관심 높음 → **Golden Keyword!**
- **낮은 CTR** → 광고 포화 또는 키워드 부적합

### 2. PC vs 모바일 전략
```typescript
if (mo_ctr > pc_ctr * 1.5) {
  strategy = "모바일 광고 집중";
} else if (pc_ctr > mo_ctr * 1.5) {
  strategy = "PC 광고 집중";  
}
```

### 3. ROI 예측
```typescript
예상 ROI = (total_ctr * total_search_cnt * 평균 전환율) / 광고비
```

### 4. 새로운 Tier 기준 추가 가능
```typescript
if (total_ctr > 10 && golden_ratio > 5) {
  tier = "DIAMOND"; // 초고효율 키워드
}
```

---

## 🎯 향후 확장 가능한 필드

API 문서에는 더 많은 필드가 있지만, 현재는 사용하지 않는 필드들:

### 수집 가능하지만 제외한 필드
- `monthlyPcClkCnt` - PC 총 클릭 수 (Average가 더 유용)
- `monthlyMobileClkCnt` - 모바일 총 클릭 수  
- `adultFilter` - 성인 필터 여부
- **광고비 관련**:
  - `monthlyTotalBidCnt` - 월 입찰 횟수
  - `monthlyTotalClkRate` - 월 총 클릭률
  - `monthlyTotalCost` - 월 총 광고비
  - ⚠️ 이 필드들은 **광고주 계정**에서만 조회 가능할 수 있음

---

## 🚀 즉시 활용 가능한 쿼리

### CTR 기준 TOP 100 키워드
```sql
SELECT 
    keyword,
    total_search_cnt,
    total_ctr,
    pc_ctr,
    mo_ctr,
    golden_ratio,
    tier
FROM keywords
WHERE total_ctr > 0
ORDER BY total_ctr DESC
LIMIT 100;
```

### 모바일 광고 최적 키워드
```sql
SELECT 
    keyword,
    mo_search_cnt,
    mo_ctr,
    mo_click_cnt
FROM keywords
WHERE mo_ctr > pc_ctr * 1.2  -- 모바일 CTR이 PC보다 20% 이상 높음
ORDER BY mo_search_cnt DESC
LIMIT 50;
```

---

## ✅ 배포 완료 체크리스트

- [x] 코드 레벨 수정 완료
- [x] 빌드 성공
- [x] Git 커밋 & 푸시
- [x] Vercel 자동 배포 진행 중
- [ ] **Supabase 마이그레이션 실행 필요** ⚠️

---

## 🎉 최종 결과

**다음 CRON 실행부터** (5분 후) CTR 데이터가 수집됩니다!

확인 방법:
1. Supabase SQL 실행 (마이그레이션)
2. 5분 후 GitHub Actions 로그 확인
3. 데이터베이스에서 `total_ctr`, `pc_ctr`, `mo_ctr` 필드 확인

**Happy CTR Tracking!** 📊🚀
