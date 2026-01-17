# Turso 데이터베이스 연결 상태 확인

## ✅ 연결 테스트 결과

**테스트 일시**: 2025-01-26
**상태**: ✅ 정상 연결

### 연결 정보
- **URL**: `libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io`
- **인증**: ✅ 성공

### 데이터베이스 상태

#### 테이블
- ✅ `keywords` 테이블 존재
- ✅ `settings` 테이블 존재

#### 키워드 데이터
- **총 키워드 수**: 168,097개
- **최근 키워드 샘플**:
  1. 맛집 (검색량: 696,000)
  2. 종로핫플 (검색량: 1,000)
  3. 아이보스 (검색량: 20,220)
  4. 성거카페 (검색량: 1,080)
  5. 백종원프랜차이즈 (검색량: 1,000)

#### 설정
- `settings` 테이블: 0개 설정

## 🔧 환경 변수 설정

### 로컬 개발 (.env.local)
```env
TURSO_DATABASE_URL=libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpUVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY3NDkyMTEsImlkIjoiOTdmODdhYTQtY2E1MS00NWNhLWJhZWItYzBhMjQ3Y2JhZWM5IiwicmlkIjoiYzllZWNhMWMtMmM3MS00ZjA2LTk4M2QtYzBkYTM2NmM2ZjcxIn0.1iNmefqRXrlCGqyRQ8qT7HoT7jhJ7A2fzwmd0OhvDRrCVXpaI1rmj6u9vhhwLS0JmRg1rvd55rDmM1NC_7q4Cg
```

### Vercel 환경 변수
Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:
1. `TURSO_DATABASE_URL`
2. `TURSO_AUTH_TOKEN`

## 🧪 연결 테스트 방법

```bash
# 환경 변수를 사용한 테스트
npx tsx scripts/test-turso-connection-env.ts
```

## ⚠️ 주의사항

1. **토큰 보안**: 토큰은 절대 공개 저장소에 커밋하지 마세요.
2. **토큰 만료**: 토큰이 만료되면 새로운 토큰을 생성하고 환경 변수를 업데이트하세요.
3. **Vercel 배포**: 로컬에서 테스트가 성공해도 Vercel 환경 변수가 설정되지 않으면 프로덕션에서 실패할 수 있습니다.

## 📝 다음 단계

1. ✅ 로컬 환경 변수 확인 완료
2. ⚠️ Vercel 환경 변수 확인 필요
3. ✅ 데이터베이스 연결 정상
4. ✅ 키워드 데이터 정상

