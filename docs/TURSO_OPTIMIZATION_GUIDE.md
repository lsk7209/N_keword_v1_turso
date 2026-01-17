# 🔍 Turso 읽기/쓰기 불균형 분석 및 최적화

## 📊 현재 사용량
```
Reads:  506.84M / 2.50B (20.3%)  ← 높음!
Writes: 1.90K / 25M (0.0076%)  ← 매우 낮음
```

## 🔍 읽기가 많은 원인

### 1️⃣ 모니터 페이지 (70-80% 원인)

`/monitor` 페이지가 로드될 때마다:

```typescript
// src/app/monitor/page.tsx
const total = await db.execute('SELECT COUNT(*) as count FROM keywords');
const analyzed = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE total_doc_cnt IS NOT NULL');
const expanded = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 1');
const platinum = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = "PLATINUM"');
const gold = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = "GOLD"');
const silver = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE tier = "SILVER"');
const recent = await db.execute('SELECT * FROM keywords ORDER BY created_at DESC LIMIT 10');
const seeds = await db.execute('SELECT COUNT(*) as count FROM keywords WHERE is_expanded = 0');
// ...총 15-20개 쿼리
```

**문제:** 
- 페이지를 새로고침할 때마다 428,668개 레코드를 스캔
- COUNT(*) 쿼리가 매우 비쌈
- 캐싱 없음

### 2️⃣ 중복 체크 (이미 비활성화됨)

```typescript
// mining-engine.ts
// SMART_DEDUPLICATION = false로 설정되어 있음 (최적화 완료)
```

### 3️⃣ 크론 작업 (10-20% 원인)

매 5분마다:
```sql
-- 시드 선택 쿼리
SELECT id, keyword, total_search_cnt FROM keywords 
WHERE is_expanded = 0 OR ... 
ORDER BY ... LIMIT 500

-- fill_docs 쿼리
SELECT id, keyword, total_search_cnt FROM keywords 
WHERE total_doc_cnt IS NULL 
ORDER BY total_search_cnt DESC LIMIT 800
```

## 💾 쓰기가 적은 이유

**자동 수집이 8시간 동안 작동하지 않았습니다!**
- UPDATE ... RETURNING 버그로 인해 수집 실패
- 방금 수정 완료 → 곧 쓰기 증가 예상

## 🚀 획기적인 최적화 방안

### ⚡ 우선순위 1: 모니터 페이지 캐싱 (80% 절감)

**현재 문제:**
- 매 요청마다 15-20개 쿼리 실행
- `export const dynamic = 'force-dynamic'` 설정

**해결책: Redis 캐싱**

```typescript
// src/app/monitor/page.tsx
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export default async function MonitorPage() {
  const cacheKey = 'monitor:stats';
  
  // 1분 캐시
  let stats = await redis.get(cacheKey);
  
  if (!stats) {
    stats = await fetchAllStats();
    await redis.setex(cacheKey, 60, JSON.stringify(stats));
  }
  
  return <MonitorUI stats={stats} />;
}
```

**대안: Vercel KV 또는 메모리 캐시**

```typescript
// 간단한 메모리 캐시
const cache = new Map();
const CACHE_TTL = 60_000; // 1분

export default async function MonitorPage() {
  const now = Date.now();
  const cached = cache.get('stats');
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return <MonitorUI stats={cached.data} />;
  }
  
  const stats = await fetchAllStats();
  cache.set('stats'', { data: stats, timestamp: now });
  return <MonitorUI stats={stats} />;
}
```

**예상 절감:** 
- Reads: 506M → 100M (80% 감소)
- 응답 속도: 3초 → 0.1초

### ⚡ 우선순위 2: Materialized View (통계 테이블)

**새 테이블 생성:**
```sql
CREATE TABLE stats_cache (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
```

**크론으로 5분마다 갱신:**
```typescript
// /api/cron/update-stats
export async function GET() {
  const stats = {
    total: await db.execute('SELECT COUNT(*) FROM keywords'),
    analyzed: await db.execute('SELECT COUNT(*) FROM keywords WHERE total_doc_cnt IS NOT NULL'),
    // ...
  };
  
  await db.execute({
    sql: 'INSERT OR REPLACE INTO stats_cache (key, value, updated_at) VALUES (?, ?, ?)',
    args: ['monitor', JSON.stringify(stats), new Date().toISOString()]
  });
}
```

**모니터 페이지:**
```typescript
const cached = await db.execute('SELECT value FROM stats_cache WHERE key = "monitor"');
const stats = JSON.parse(cached.rows[0].value);
```

**예상 절감:**
- Reads: 506M → 50M (90% 감소)
- 1개 쿼리로 모든 통계 조회

### ⚡ 우선순위 3: 인덱스 최적화

**현재 문제:**
- `WHERE is_expanded = 0` 쿼리가 느림
- `WHERE total_doc_cnt IS NULL` 쿼리가 느림

**추가 인덱스:**
```sql
CREATE INDEX idx_is_expanded_search ON keywords(is_expanded, total_search_cnt DESC);
CREATE INDEX idx_doc_cnt_search ON keywords(total_doc_cnt, total_search_cnt DESC);
CREATE INDEX idx_tier ON keywords(tier) WHERE tier IS NOT NULL;
CREATE INDEX idx_created_at ON keywords(created_at DESC);
```

**예상 절감:**
- 쿼리 속도: 10배 향상
- Reads: 약간 감소 (스캔 최적화)

### ⚡ 우선순위 4: COUNT(*) 최적화

**문제:** `COUNT(*)`는 전체 테이블 스캔

**대안 1: 근사값 사용**
```typescript
// 정확한 값 대신 어림값
const estimate = 428_000; // 하드코딩 또는 stats_cache에서
```

**대안 2: 증분 카운터**
```sql
CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  count INTEGER,
  updated_at TEXT
);

-- 키워드 추가 시
UPDATE counters SET count = count + 1, updated_at = ? WHERE name = 'total_keywords';

-- 조회 시
SELECT count FROM counters WHERE name = 'total_keywords';
```

### ⚡ 우선순위 5: 쿼리 병합

**현재: 여러 개의 COUNT 쿼리**
```sql
SELECT COUNT(*) FROM keywords WHERE tier = 'PLATINUM'
SELECT COUNT(*) FROM keywords WHERE tier = 'GOLD'
SELECT COUNT(*) FROM keywords WHERE tier = 'SILVER'
```

**최적화: 단일 쿼리**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN tier = 'PLATINUM' THEN 1 END) as platinum,
  COUNT(CASE WHEN tier = 'GOLD' THEN 1 END) as gold,
  COUNT(CASE WHEN tier = 'SILVER' THEN 1 END) as silver,
  COUNT(CASE WHEN is_expanded = 1 THEN 1 END) as expanded
FROM keywords;
```

**예상 절감:**
- 5개 쿼리 → 1개 쿼리 (80% 감소)

## 📋 즉시 적용 가능한 최적화 (우선순위 순)

### 🥇 1단계: 메모리 캐시 (5분 작업, 80% 절감)
→ 모니터 페이지에 간단한 메모리 캐시 추가

### 🥈 2단계: 쿼리 병합 (10분 작업, 50% 절감)
→ 여러 COUNT 쿼리를 하나로 병합

### 🥉 3단계: Stats 테이블 (30분 작업, 90% 절감)
→ Materialized view 방식으로 통계 캐싱

### 4단계: 인덱스 추가 (10분 작업, 쿼리 속도 10배)
→ 자주 사용하는 컬럼에 인덱스 생성

## 🎯 최종 예상 효과

**현재:**
- Reads: 506M / 2.50B (20%)
- 페이지 로드: 3-5초

**최적화 후:**
- Reads: 50M / 2.50B (2%) ← 10배 감소!
- 페이지 로드: 0.1-0.3초 ← 10-50배 빠름!
- 무료 티어로도 충분

## 💡 권장 즉시 조치

1. **지금 바로**: 모니터 페이지 메모리 캐시 추가
2. **오늘 중**: 쿼리 병합
3. **이번 주**: Stats 테이블 + 인덱스

어떤 최적화를 먼저 적용하시겠어요? 코드를 바로 작성해 드리겠습니다!
