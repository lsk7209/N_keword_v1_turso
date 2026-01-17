# CEO 매뉴얼: 네이버 황금키워드 채굴기

이 문서는 **비기술자 CEO**가 서비스를 운영하고 관리하기 위한 가이드입니다.

## 1. 초기 세팅 (Setup)

### 1-1. Turso 데이터베이스 설정
1. [Turso](https://turso.tech) 프로젝트 생성 및 로그인.
2. 새 데이터베이스 생성.
3. 데이터베이스 URL과 Auth Token 확인.
4. Turso CLI 설치: `curl -sSfL https://get.tur.so/install.sh | bash`
5. `turso db shell your-database-name < turso/schema.sql` 실행하여 스키마 생성.
   - 또는 Turso 웹 대시보드의 SQL Editor에서 `turso/schema.sql` 내용을 복사/붙여넣기.

### 1-2. 환경변수 (Environment Variables)
Vercel 배포 시 다음 변수를 설정해야 합니다.

| 변수명 | 설명 | 예시 |
|---|---|---|
| `TURSO_DATABASE_URL` | Turso 데이터베이스 URL | libsql://your-db.turso.io |
| `TURSO_AUTH_TOKEN` | Turso 인증 토큰 | your-auth-token (절대 노출 금지) |
| `NAVER_AD_API_KEYS` | 네이버 검색광고 API 키 배열 | `["Access:Secret:CustId", ...]` |
| `NAVER_SEARCH_API_KEYS` | 네이버 검색/쇼핑 API 키 배열 | `["Client:Secret", ...]` |
| `CRON_SECRET` | 마이닝 API 보안 키 | 임의의 긴 문자열 |

**참고**: 이전에 Supabase를 사용했다면 `TURSO_MIGRATION.md` 문서를 참고하여 데이터를 마이그레이션하세요.

### 1-3. GitHub Actions (자동 채굴) 설정
1. GitHub Repo > Settings > Secrets and variables > Actions.
2. 다음 Secret 추가:
   - `PROD_URL`: 배포된 Vercel 도메인 (예: `https://my-app.vercel.app`)
   - `CRON_SECRET`: 위에서 설정한 비밀키와 동일값.

---

## 2. 운영 방법 (Operation)

### 대시보드 접속
- 주소: `https://your-domain.com/insight`
- 기능:
  - **High Volume**: 검색량이 많은 순서로 정렬 (트래픽 확보용)
  - **Golden Ratio**: 문서 수는 적고 검색량은 많은 순서로 정렬 (빈집털이용)
  - **Tier**: 플래티넘/골드 등급 위주로 포스팅 주제 선정.

### 채굴 로직
- 시스템은 5분마다 자동으로 돌아갑니다.
- 1회 실행 시 하나의 '시드 키워드'를 확장하여 수십~수백 개의 연관 키워드를 분석합니다.
- **확장 대상**: 검색량 1,000 이상인 키워드가 자동으로 시드가 되어 가지를 뻗어나갑니다.
- **중복 방지**: 최근 7일 내 수집된 키워드는 다시 수집하지 않습니다.

## 3. 문제 해결 (Troubleshooting)

### 데이터가 안 들어와요
- **GitHub Actions 탭 확인**: 마이닝 작업이 실패(Red)했는지 확인하세요.
- **API 키 한도 초과**: 네이버 API 키가 만료되거나 한도를 초과했을 수 있습니다. `NAVER_SEARCH_API_KEYS`에 여분의 키를 추가하세요.
- **타임아웃**: Vercel 함수 시간을 초과했을 수 있습니다. 이 경우 배치는 실패 처리되지만, 다음 배치가 다시 시도합니다.

---

## 4. 수익화 전략 (Next Step)
- **Top Tier 키워드**를 엑셀로 다운로드하는 기능 추가 (유료화 모델).
- 블로그 글 자동 생성기와 연동.
