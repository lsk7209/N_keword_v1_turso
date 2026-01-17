# 시드키워드 확장 문제 진단 및 해결 방안

## 📊 현재 상황

- **확장 가능한 시드키워드**: 161,954개
- **최근 1시간 수집**: 9개
- **최근 1시간 확장**: 0개
- **Processing 상태**: 0개

## ❌ 문제 발견

**최근 1시간 동안 expand 작업이 실행되지 않았습니다!**

이는 자동수집 API가 호출되지 않고 있다는 의미입니다.

## 🔍 원인 분석

### 가능한 원인

1. **Vercel Cron이 실행되지 않음**
   - `vercel.json`에 Cron 작업이 설정되어 있지만 실제로 실행되지 않을 수 있음
   - Vercel 대시보드에서 Cron 작업 상태 확인 필요

2. **GitHub Actions 워크플로우가 실행되지 않음**
   - `.github/workflows/miner.yml`이 설정되어 있지만 실행되지 않을 수 있음
   - GitHub Actions 탭에서 워크플로우 실행 상태 확인 필요

3. **API 인증 실패**
   - `CRON_SECRET` 환경 변수가 설정되지 않았거나 잘못되었을 수 있음
   - Vercel 환경 변수 설정 확인 필요

4. **task 파라미터 문제**
   - `task=expand` 파라미터가 제대로 전달되지 않을 수 있음
   - URL 쿼리 파라미터 확인 필요

## ✅ 해결 방안

### 1. Vercel Cron 작업 상태 확인

1. Vercel 대시보드 접속
2. 프로젝트 선택
3. **Settings** → **Cron Jobs** 탭 확인
4. 다음 Cron 작업들이 설정되어 있는지 확인:
   - `*/3 * * * *` - `task=expand`
   - `1-59/3 * * * *` - `task=expand`
   - `2-59/3 * * * *` - `task=expand`
   - `*/3 * * * *` - `task=fill_docs`
   - `1-59/3 * * * *` - `task=fill_docs`

5. 최근 실행 이력 확인
   - 각 Cron 작업의 최근 실행 시간 확인
   - 실패한 실행이 있는지 확인

### 2. GitHub Actions 워크플로우 상태 확인

1. GitHub 저장소 접속
2. **Actions** 탭 확인
3. **Golden Keyword Miner Cron** 워크플로우 확인
4. 최근 실행 이력 확인
   - 실행 시간: 3분마다 실행되어야 함
   - 실행 상태: 성공/실패 여부 확인

### 3. 환경 변수 확인

Vercel 환경 변수에 다음이 설정되어 있는지 확인:
- `CRON_SECRET`: Cron 작업 인증용 시크릿 키
- `TURSO_DATABASE_URL`: Turso DB URL
- `TURSO_AUTH_TOKEN`: Turso DB 인증 토큰
- `NAVER_AD_API_KEYS`: 네이버 광고 API 키들
- `NAVER_SEARCH_API_KEYS`: 네이버 검색 API 키들

### 4. 수동 테스트

자동수집 API를 수동으로 호출하여 테스트:

```bash
# 로컬에서 테스트 (개발 서버 실행 필요)
curl -X GET "http://localhost:3000/api/miner/execute?task=expand&mode=TURBO&expandBatch=10&expandConcurrency=5&minSearchVolume=1000&maxRunMs=30000" \
  -H "CRON_SECRET: your-secret-key"
```

또는 프로덕션 URL 사용:
```bash
curl -X GET "https://your-domain.vercel.app/api/miner/execute?task=expand&mode=TURBO&expandBatch=10&expandConcurrency=5&minSearchVolume=1000&maxRunMs=30000" \
  -H "CRON_SECRET: your-secret-key"
```

### 5. 로그 확인

Vercel 대시보드에서 함수 로그 확인:
1. **Deployments** 탭
2. 최근 배포 선택
3. **Functions** 탭
4. `/api/miner/execute` 함수 로그 확인
5. 에러 메시지 확인

## 🔧 임시 해결책

자동수집이 작동하지 않는 경우, 수동으로 expand 작업을 실행할 수 있습니다:

1. **모니터링 페이지에서 수동 수집**
   - `/monitor` 페이지 접속
   - 수동 수집 기능 사용

2. **스크립트로 직접 실행**
   ```bash
   npx tsx scripts/manual-expand.ts
   ```

## 📝 다음 단계

1. Vercel Cron 작업 상태 확인 및 수정
2. GitHub Actions 워크플로우 실행 상태 확인
3. 환경 변수 확인 및 수정
4. 수동 테스트로 API 동작 확인
5. 로그 확인으로 에러 원인 파악

## 🚨 긴급 조치

만약 자동수집이 계속 작동하지 않는다면:

1. **Processing 상태 키워드 리셋**
   ```bash
   npx tsx scripts/reset-processing-keywords.ts
   ```

2. **모든 시드키워드 리셋 (필요시)**
   ```bash
   npx tsx scripts/reset-all-seed-keywords.ts
   ```

3. **수동 수집으로 임시 대응**
   - 모니터링 페이지에서 수동 수집 사용
   - 또는 스크립트로 직접 실행

