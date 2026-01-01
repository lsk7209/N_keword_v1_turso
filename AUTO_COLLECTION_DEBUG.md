# 자동 수집 중단 원인 진단 가이드

## 현재 상태
- ⏱️ 8시간 동안 자동 수집 없음
- 📊 Turso Writes: 1.90K / 25M (0.0076%)
- ✅ 비용은 안전 (거의 사용 안함)

## 즉시 확인 필요 사항

### 1️⃣ GitHub Actions 로그 확인 (최우선!)

**확인 방법:**
1. GitHub 저장소 접속
2. 상단 탭에서 `Actions` 클릭
3. 왼쪽에서 `Golden Keyword Miner Cron` 선택
4. 최근 실행된 workflow 클릭
5. 로그 확인

**확인할 내용:**
- ✅ 실행 성공 (녹색 체크) vs ❌ 실패 (빨간 X)
- 로그에 `200 OK` vs `401 Unauthorized` vs `500 Error`
- `Calling miner:` 다음에 나오는 응답

**가능한 에러와 해결책:**

#### A. `401 Unauthorized` 또는 `403 Forbidden`
**원인**: Vercel Deployment Protection 활성화
**해결**: 
```
Vercel Dashboard → Settings → Deployment Protection 
→ "Vercel Authentication" 비활성화
```

#### B. `PROD_URL not set`
**원인**: GitHub Secrets에 PROD_URL이 없음
**해결**:
```
GitHub → Settings → Secrets and variables → Actions
→ New repository secret
  Name: PROD_URL
  Value: https://YOUR-PROJECT.vercel.app
```

#### C. `curl: (28) Timeout`
**원인**: Vercel 함수가 60초 내에 응답하지 않음
**해결**: 이미 maxRunMs=58000으로 설정되어 있음 (정상)

### 2️⃣ Vercel 로그 확인

**확인 방법:**
1. Vercel Dashboard 접속
2. 프로젝트 선택
3. 상단 `Logs` 탭 클릭
4. `/api/miner/execute` 필터 적용

**확인할 내용:**
- 최근 8시간 동안 요청이 있었는지?
- 요청이 있었다면 에러 메시지는?
- 요청이 없었다면 GitHub Actions가 호출 자체를 못하는 것

### 3️⃣ 수동 API 호출 테스트

터미널에서 직접 테스트:
```bash
curl -X GET "https://YOUR-PROJECT.vercel.app/api/miner/execute?task=expand&mode=TURBO&expandBatch=10&expandConcurrency=5&minSearchVolume=100&maxRunMs=58000" \
  -H "CRON-SECRET: YOUR_CRON_SECRET"
```

**예상 응답:**
- ✅ 성공: `{"expand":{"processed":10,...}}`
- ❌ 실패: `{"error":"..."}`

## 임시 해결책: 수동 크론 설정

GitHub Actions가 작동하지 않는다면, Vercel Cron을 다시 활성화:

**vercel.json 수정:**
```json
{
  "crons": [
    {
      "path": "/api/miner/execute?task=expand&expandBatch=500&expandConcurrency=100&minSearchVolume=50&maxRunMs=58000",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

그러나 **GitHub Actions 로그를 먼저 확인**하는 것이 중요합니다!

## 다음 단계

1. **지금 즉시**: GitHub Actions 로그 확인
2. **에러 발견 시**: 에러 메시지를 알려주세요
3. **로그 확인 후**: Vercel 로그도 확인

로그를 확인하시고 결과를 알려주시면, 정확한 해결책을 드리겠습니다! 🔍
