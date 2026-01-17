# 🚀 Vercel 배포 가이드 (Golden Keyword Miner)

## 1. 사전 준비
이 프로젝트는 **Cloudflare Pages**가 아닌 **Vercel**에 최적화되어 있습니다.
Vercel은 Next.js 개발사가 만든 호스팅 서비스로, 서버리스 함수(API Routes)와 Cron Job(자동 채굴)을 완벽하게 지원합니다.

## 2. Vercel 프로젝트 생성
1. [Vercel Dashboard](https://vercel.com/dashboard)에 접속합니다.
2. `Add New` > `Project`를 클릭합니다.
3. GitHub 리포지토리(`naver-gold-key` 등)를 연결하고 `Import`를 누릅니다.

## 3. 환경 변수 설정 (Environment Variables)
배포 설정 화면의 **Environment Variables** 섹션에 `.env.local`의 내용을 모두 복사해 넣어야 합니다.
**주의:** `CRON_SECRET`은 외부에서 임의로 실행하지 못하게 하는 암호입니다.

| 변수명 | 설명 | 예시 값 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | `eyJxh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **(중요)** Supabase 관리자 키 | `eyJxh...` (절대 공개 금지) |
| `NAVER_AD_KEYS` | 네이버 광고 API 키 (JSON 배열 문자열) | `[{"key":"...","secret":"...","cust":"..."}]` |
| `NAVER_SEARCH_KEYS` | 네이버 검색 API 키 (JSON 배열 문자열) | `[{"key":"...","secret":"..."}]` |
| `CRON_SECRET` | 크론 작업 실행용 비밀키 | `MySuperSecretCronKey123!` |

*팁: `.env.local` 파일을 열어서 전체 내용을 복사한 후, Vercel의 변수 입력창에 붙여넣기하면 한 번에 파싱됩니다.*

## 4. 배포 및 확인
1. `Deploy` 버튼을 누릅니다.
2. 배포가 완료되면 대시보드 URL로 접속하여 정상 작동하는지 확인합니다.
3. **Cron Job 확인:**
   - Vercel 프로젝트 대시보드 > `Settings` > `Cron Jobs` 메뉴로 들어갑니다.
   - `vercel.json`에 정의된 `/api/miner/execute` 작업이 등록되었는지 확인합니다.
   
## 5. (선택) GitHub Actions 자동화 설정
Vercel 무료 플랜의 Cron 제한(하루 1회 등)을 넘어서 **5분마다** 실행하고 싶다면 GitHub Actions를 사용하세요.

1. GitHub 리포지토리 > **Settings** > **Secrets and variables** > **Actions**로 이동합니다.
2. `New repository secret`을 클릭하여 다음 두 가지를 추가합니다.
   - `PROD_URL`: 배포된 Vercel 앱 주소 (예: `https://my-gold-miner.vercel.app`) - **맨 뒤 슬래시(/) 제외**
   - `CRON_SECRET`: Vercel 환경 변수에 설정한 것과 동일한 비밀키
3. 이제 `.github/workflows/mining.yml`에 의해 5분마다 자동으로 채굴기가 실행됩니다.

## 6. 트러블슈팅
*   **504 Gateway Timeout**: 채굴량이 너무 많아서 60초를 초과한 경우입니다.
    *   해결: `src/utils/mining-engine.ts`의 `BATCH_SIZE`를 줄이거나, `fetchRelatedKeywords`의 로직에서 한 번에 처리하는 개수를 줄여야 합니다. (현재 코드는 최적화되어 있음)
*   **429 Too Many Requests**: 네이버 API 호출 한도 초과입니다.
    *   해결: `NAVER_AD_KEYS`나 `NAVER_SEARCH_KEYS`에 API 키를 더 추가하여 라운드 로빈이 원활하게 돌도록 하십시오.

## 6. 운영 꿀팁
*   **Vercel Hobby Plan (무료)**:
    *   Serverless Function 실행 시간 제한: **10초** (Pro는 60초, Enterprise는 900초)
    *   **주의:** 현재 Pro 플랜 기준으로 `maxDuration = 60`이 설정되어 있습니다. 무료 플랜 사용 시 10초 내에 작업이 안 끝나면 타임아웃이 발생할 수 있습니다.
    *   무료 플랜이라면 `cron` 주기를 더 자주 돌리되, 한 번에 처리하는 양(`limitDocCount` 등)을 줄여야 합니다.
    *   *현재 코드는 무료 플랜에서도 최대한 돌 수 있도록 배치 사이즈를 조절해두었으나, API 반응 속도에 따라 간헐적 타임아웃이 발생할 수 있습니다.*
