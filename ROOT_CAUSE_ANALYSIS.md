# 🚨 자동 수집 미작동 원인 분석

## ✅ 확인된 사항
- API 키: AD 14개, SEARCH 30개 정상 ✅
- GitHub Actions: HTTP 200 성공 ✅
- 대기 시드: 246,468개 존재 ✅

## ❌ 문제
- DB에 변화 없음 (여전히 428,668개)
- API 응답에 `expand` 결과 없음

## 🔍 원인 추정

### 가능성 1: Turso 연결 문제 (60%)
**증상:** Vercel에서 Turso DB에 연결하지 못함

**확인 방법:**
1. Vercel Dashboard → Logs
2. Functions 탭 → `/api/miner/execute` 필터
3. 로그에서 다음 검색:
   - `Turso connection error`
   - `ETIMEDOUT`
   - `401` (Turso 인증 실패)

**해결책:**
- Turso 토큰이 만료되었을 수 있음
- `TURSO_AUTH_TOKEN` 재발급 필요

### 가능성 2: 시드 선택 쿼리 실패 (30%)
**증상:** `UPDATE ... WHERE is_expanded = 0` 쿼리가 0개 반환

**확인 방법:**
Vercel 로그에서:
```
[Batch] Claimed 0 seeds
```

**해결책:**
- `is_expanded = 0` 조건 확인
- 인덱스 문제일 수 있음

### 가능성 3: 메모리/타임아웃 (10%)  
**증상:** Vercel 함수가 중간에 종료됨

**확인 방법:**
Vercel 로그에서:
```
Task timed out after 60.00 seconds
```

**해결책:**
- 배치 크기 줄이기
- maxRunMs 조정

## 📋 즉시 확인 순서

### Step 1: Vercel 함수 로그 확인 (최우선!)

1. **Vercel Dashboard 접속**
   ```
   https://vercel.com/dashboard
   → 프로젝트 선택
   → Logs 탭
   ```

2. **필터 설정**
   ```
   Source: Functions
   Path: /api/miner/execute
   Time: Last 1 hour
   ```

3. **로그에서 찾을 내용**
   ```
   [Batch] Starting Parallel Mining Batch...
   [Batch] Mode: TURBO, Keys(S/A): 30/14, Task: expand
   [Batch] Config: Expand(Batch:500, Conc:100)
   
   ← 여기서 멈추면 문제!
   ```

4. **에러 메시지 확인**
   - 빨간색 ERROR 라인
   - Stack trace
   - 마지막 로그 라인

### Step 2: Turso 토큰 확인

**Turso 토큰은 만료될 수 있습니다!**

1. **토큰 재발급:**
   ```bash
   turso db tokens create nkeword
   ```

2. **Vercel 환경변수 업데이트:**
   ```
   Vercel Dashboard → Settings → Environment Variables
   → TURSO_AUTH_TOKEN 편집
   → 새 토큰으로 교체
   → Save
   → Redeploy
   ```

### Step 3: 임시 디버그 모드 활성화

더 상세한 로그를 보기 위해:

**vercel.json 수정 (임시):**
```json
{
  "env": {
    "DEBUG": "true"
  }
}
```

## 🚀 빠른 테스트

터미널에서 직접 API 호출:
```bash
curl "https://YOUR-PROJECT.vercel.app/api/miner/execute?task=expand&expandBatch=10&expandConcurrency=5&minSearchVolume=100&maxRunMs=10000" \
  -H "CRON_SECRET: YOUR_SECRET" \
  -v
```

**예상 정상 응답:**
```json
{
  "expand": {
    "processed": 10,
    "saved": 200,
    ...
  }
}
```

**현재 응답:**
```json
{
  "mode": "TURBO",
  "info": "..."
}
```
← `expand` 필드 없음 = 문제!

## 📌 다음 단계

1. **Vercel 로그 확인** ← 가장 중요!
2. 로그에서 발견한 에러 메시지를 알려주세요
3. 에러에 따라 정확한 해결책 제시

**Vercel 로그를 확인하고 결과를 알려주세요!** 🔍
