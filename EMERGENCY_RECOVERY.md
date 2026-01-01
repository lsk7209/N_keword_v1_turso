# 자동 수집 긴급 복구 가이드

## 🚨 현재 상황
- 8시간 동안 자동 수집 중단
- GitHub Actions는 실행 중이지만 Vercel API가 호출되지 않거나 실패

## 🔧 즉시 확인 및 수정 방법

### Step 1: GitHub Actions 로그 확인 (30초)

1. https://github.com/YOUR_REPO/actions 접속
2. 최근 `Golden Keyword Miner Cron` 클릭
3. 로그에서 다음 중 하나 확인:

**Case A: `❌ ERROR: PROD_URL or CRON_SECRET is not set`**
→ GitHub Secrets 설정 필요 (아래 Step 2)

**Case B: `⚠️ HTTP 401` 또는 `⚠️ HTTP 403`**
→ Vercel Deployment Protection 문제 (아래 Step 3)

**Case C: `⚠️ HTTP 500`**
→ Vercel 함수 에러 (아래 Step 4)

**Case D: `✅ HTTP 200`인데도 수집 안됨**
→ DB 연결 문제 (아래 Step 5)

### Step 2: GitHub Secrets 설정

**필요한 Secrets:**
```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

1. **PROD_URL**
   - Value: `https://your-project.vercel.app`
   - ⚠️ 끝에 슬래시(/) 없이!

2. **CRON_SECRET**
   - Value: Vercel 환경변수의 `CRON_SECRET`과 동일한 값
   - 예: `your-secret-key-123`

### Step 3: Vercel Deployment Protection 비활성화

**가장 흔한 원인!**

1. Vercel Dashboard 접속
2. 프로젝트 선택
3. Settings → Deployment Protection
4. **"Vercel Authentication" 토글 OFF**
5. Save

또는:

Settings → General → "Protection Bypass for Automation"에서  
GitHub Actions IP 범위 허용

### Step 4: Vercel 환경변수 확인

Vercel Dashboard → Settings → Environment Variables

**필수 환경변수:**
- ✅ `NAVER_AD_API_KEYS` (All Environments)
- ✅ `NAVER_SEARCH_API_KEYS` (All Environments)
- ✅ `CRON_SECRET` (All Environments)
- ✅ `TURSO_DATABASE_URL` (All Environments)
- ✅ `TURSO_AUTH_TOKEN` (All Environments)

**확인 후 다시 배포:**
Vercel Dashboard → Deployments → 최신 배포 선택 → Redeploy

### Step 5: 수동 API 테스트 (로컬)

터미널에서 직접 호출 테스트:

```bash
# YOUR_PROJECT_URL과 YOUR_CRON_SECRET을 실제 값으로 교체
curl -X GET "https://YOUR_PROJECT_URL.vercel.app/api/miner/execute?task=expand&expandBatch=10&expandConcurrency=5&minSearchVolume=100&maxRunMs=10000" \
  -H "CRON_SECRET: YOUR_CRON_SECRET" \
  -v
```

**예상 응답:**
- ✅ 정상: `HTTP/1.1 200 OK` + JSON 응답
- ❌ 비정상: `HTTP/1.1 401 Unauthorized`

## 🚀 긴급 임시 해결책: Vercel Cron 활성화

GitHub Actions가 복구되기 전까지 Vercel 내장 Cron으로 대체:

**vercel.json 수정:**
```json
{
  "crons": [
    {
      "path": "/api/miner/execute?task=expand&expandBatch=500&expandConcurrency=100&minSearchVolume=50&maxRunMs=58000",
      "schedule": "*/5 * * * <"
    },
    {
      "path": "/api/miner/execute?task=fill_docs&fillBatch=800&fillConcurrency=150&maxRunMs=55000",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**적용:**
```bash
git add vercel.json
git commit -m "Enable Vercel Cron as fallback"
git push
```

## 📊 복구 확인 (5분 후)

```bash
npx tsx quick-check.ts
```

**예상 결과:**
- LAST_30MIN: 5000+ ✅
- PROCESSING: 500 ✅
- TOTAL: 증가 중 ✅

## ⚡ 가장 빠른 해결책 우선순위

1. **Vercel Deployment Protection OFF** (1분 소요, 80% 성공률)
2. **GitHub Secrets 확인** (2분 소요)
3. **Vercel Cron 활성화** (3분 소요, 100% 성공)

지금 바로 Step 1부터 시작하세요!
