# Turso 데이터베이스 마이그레이션 가이드

이 문서는 Supabase에서 Turso로 데이터베이스를 마이그레이션하는 방법을 설명합니다.

## 1. Turso 프로젝트 생성

1. [Turso 웹사이트](https://turso.tech)에 접속하여 계정 생성
2. 새 데이터베이스 생성
3. 데이터베이스 URL과 Auth Token 확인

## 2. 환경 변수 설정

### 로컬 개발 환경 (`.env.local`)

```env
# Turso 설정 (필수)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# 공개 클라이언트 (선택사항, 클라이언트 사이드에서 사용 시)
NEXT_PUBLIC_TURSO_DATABASE_URL=libsql://your-database.turso.io
NEXT_PUBLIC_TURSO_AUTH_TOKEN=your-readonly-token

# Supabase 설정 (마이그레이션 시에만 필요)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Vercel 배포 환경

Vercel 대시보드에서 다음 환경 변수를 설정하세요:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- (선택) `NEXT_PUBLIC_TURSO_DATABASE_URL`
- (선택) `NEXT_PUBLIC_TURSO_AUTH_TOKEN`

## 3. Turso 스키마 생성

Turso CLI를 사용하여 스키마를 생성합니다:

```bash
# Turso CLI 설치 (아직 설치하지 않은 경우)
curl -sSfL https://get.tur.so/install.sh | bash

# Turso 로그인
turso auth login

# 데이터베이스에 연결하여 스키마 실행
turso db shell your-database-name < turso/schema.sql
```

또는 Turso 웹 대시보드의 SQL Editor에서 `turso/schema.sql` 파일의 내용을 복사하여 실행할 수 있습니다.

## 4. 데이터 마이그레이션

### 4-1. 마이그레이션 스크립트 실행

```bash
# 의존성 설치 (tsx가 필요합니다)
npm install

# 마이그레이션 실행
npm run migrate:to-turso
```

스크립트는 다음을 수행합니다:
- Supabase에서 모든 키워드 데이터를 읽어옵니다
- Turso에 데이터를 삽입하거나 업데이트합니다
- 설정 데이터도 함께 마이그레이션합니다

### 4-2. 마이그레이션 확인

마이그레이션 후 Turso 데이터베이스에서 데이터를 확인하세요:

```bash
turso db shell your-database-name
```

SQL 쿼리:
```sql
SELECT COUNT(*) FROM keywords;
SELECT * FROM keywords LIMIT 10;
```

## 5. 코드 변경 사항

### 주요 변경사항

1. **데이터베이스 클라이언트**
   - `src/utils/supabase.ts` → `src/utils/turso.ts`
   - Supabase 클라이언트 대신 Turso 클라이언트 사용

2. **쿼리 문법**
   - Supabase 쿼리 빌더 → 직접 SQL 쿼리
   - PostgreSQL 문법 → SQLite 문법

3. **데이터 타입**
   - UUID → TEXT (SQLite는 UUID 타입이 없음)
   - timestamptz → TEXT (ISO 8601 문자열)
   - boolean → INTEGER (0/1)
   - numeric → REAL

### 변경된 파일 목록

- `src/utils/turso.ts` (신규)
- `src/utils/mining-engine.ts`
- `src/utils/batch-runner.ts`
- `src/app/api/keywords/route.ts`
- `src/app/api/miner/execute/route.ts`
- `src/app/api/monitor/stats/route.ts`
- `src/app/api/keywords/export/route.ts`
- `src/app/actions.ts`

## 6. 테스트

마이그레이션 후 다음을 테스트하세요:

1. **개발 서버 실행**
   ```bash
   npm run dev
   ```

2. **기능 테스트**
   - 홈페이지 접속 확인
   - 키워드 목록 조회 (`/insight`)
   - 수동 채굴 기능 테스트
   - 모니터링 대시보드 확인 (`/monitor`)

3. **API 테스트**
   - `/api/keywords` 엔드포인트 테스트
   - `/api/miner/execute` 엔드포인트 테스트 (CRON_SECRET 필요)

## 7. 배포

모든 테스트가 완료되면 Vercel에 배포하세요:

```bash
# Git 커밋 및 푸시
git add .
git commit -m "Migrate from Supabase to Turso"
git push

# Vercel이 자동으로 배포합니다
```

## 8. 트러블슈팅

### 문제: "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN"

**해결**: 환경 변수가 올바르게 설정되었는지 확인하세요.

### 문제: "Table 'keywords' does not exist"

**해결**: Turso 스키마를 먼저 생성하세요 (`turso/schema.sql` 실행).

### 문제: 마이그레이션 중 타임아웃

**해결**: 배치 크기를 줄이거나 여러 번에 나누어 실행하세요.

### 문제: 데이터 불일치

**해결**: 
1. Supabase와 Turso의 데이터 개수를 비교
2. 샘플 데이터를 직접 확인
3. 필요시 마이그레이션 스크립트를 다시 실행 (중복 키워드는 업데이트됨)

## 9. 롤백 (필요 시)

Supabase로 롤백하려면:

1. 환경 변수를 Supabase로 되돌리기
2. `src/utils/supabase.ts` 파일 복원
3. 모든 API 라우트를 Supabase 쿼리로 되돌리기

또는 Git을 사용하여 이전 커밋으로 되돌릴 수 있습니다.

## 10. 성능 비교

Turso의 장점:
- **엣지 네트워크**: 전 세계에 분산된 데이터베이스로 낮은 지연시간
- **SQLite 호환**: 표준 SQLite 문법 사용
- **확장성**: 수평 확장 가능

주의사항:
- SQLite는 동시 쓰기 제한이 있으므로, 높은 동시성 요구사항이 있는 경우 Turso의 복제본을 활용하세요.

