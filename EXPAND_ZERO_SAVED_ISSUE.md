# 시드키워드 확장 시 저장 0개 문제 분석

## 📊 문제 상황

GitHub Actions 로그에서 확인된 문제:
- **2000개 시드 처리**: ✅ 정상
- **totalSaved: 0**: ❌ 문제
- **대부분 rejected 또는 (+0)**: ❌ 문제

### 로그 예시
```
"홍대맛집 (+0)" - 성공했지만 저장된 키워드 0개
"포켓몬 (rejected)" - 실패
"시계 (rejected)" - 실패
```

## 🔍 원인 분석

### 1. `(+0)` 상태 (성공했지만 저장 0개)

가능한 원인:

#### A. API에서 연관 키워드를 가져오지 못함
- 네이버 광고 API가 빈 배열 반환
- API 키 문제 또는 Rate Limit
- **확인 방법**: `[MiningEngine] 📥 Fetched X related keywords from API` 로그 확인

#### B. 필터링으로 모든 키워드가 제외됨
- `minSearchVolume=1000` 필터로 인해 모든 키워드가 제외
- 블랙리스트로 인해 모든 키워드가 제외
- **확인 방법**: `[MiningEngine] 🔍 Filtering results` 로그 확인

#### C. 모든 키워드가 이미 DB에 존재
- `INSERT OR IGNORE`로 인해 중복 키워드는 저장되지 않음
- **확인 방법**: `[MiningEngine] ⏭️ Skipping X existing keywords` 로그 확인

### 2. `(rejected)` 상태 (실패)

가능한 원인:

#### A. API 키 문제
- 네이버 광고 API 키가 만료되었거나 잘못됨
- API 키가 Rate Limit에 도달
- **확인 방법**: `[MiningEngine] Ad API Error` 로그 확인

#### B. 네트워크 문제
- API 호출 타임아웃
- 네트워크 연결 실패
- **확인 방법**: `[Batch] Seed Failed` 로그의 에러 메시지 확인

#### C. DB 트랜잭션 문제
- DB 저장 중 에러 발생
- **확인 방법**: `[MiningEngine] ❌ DB Batch Error` 로그 확인

## ✅ 해결 방안

### 1. 로그 개선 (완료)

다음 실행 시 더 자세한 로그가 출력됩니다:
- `[MiningEngine] 📥 Fetched X related keywords from API` - API에서 가져온 키워드 수
- `[MiningEngine] 🔍 Filtering results` - 필터링 상세 정보
- `[MiningEngine] ⏭️ Skipping X existing keywords` - 중복 키워드 수
- `[Batch] ⚠️ Seed "X" processed but saved 0 keywords` - 저장 0개 경고

### 2. 즉시 확인 사항

#### A. API 키 상태 확인
```bash
# API 키 개수 확인
npx tsx scripts/check-api-keys.ts
```

#### B. 최근 수집된 키워드 확인
```bash
# 최근 수집된 키워드 확인
npx tsx scripts/check-recent-collection.ts
```

#### C. 시드키워드 상태 확인
```bash
# 시드키워드 상태 확인
npx tsx scripts/check-seed-keywords-status.ts
```

### 3. 문제별 해결 방법

#### 문제 A: API에서 연관 키워드를 가져오지 못함

**해결 방법**:
1. 네이버 광고 API 키 확인
2. API 키 Rate Limit 확인
3. API 키 추가 또는 교체

#### 문제 B: 필터링으로 모든 키워드가 제외됨

**해결 방법**:
1. `minSearchVolume` 값을 낮춤 (1000 → 500 또는 100)
2. 블랙리스트 확인 및 수정
3. 필터링 로직 확인

#### 문제 C: 모든 키워드가 이미 DB에 존재

**해결 방법**:
1. 새로운 시드키워드 추가
2. 이미 확장된 키워드 재확장 (현재는 `is_expanded = 0, 1, 2` 모두 포함)
3. 더 깊은 확장 레벨 설정

#### 문제 D: API 키 문제

**해결 방법**:
1. Vercel 환경 변수에서 API 키 확인
2. API 키 추가 또는 교체
3. Rate Limit 확인 및 대기

### 4. 임시 해결책

자동수집이 작동하지 않는 경우:

1. **수동 수집 사용**
   - `/monitor` 페이지에서 수동 수집
   - 더 낮은 `minSearchVolume` 사용 가능

2. **배치 크기 감소**
   - `expandBatch=2000` → `expandBatch=100`으로 감소
   - 더 자세한 로그 확인 가능

3. **동시성 감소**
   - `expandConcurrency=130` → `expandConcurrency=10`으로 감소
   - API Rate Limit 회피

## 📝 다음 단계

1. **다음 실행 시 로그 확인**
   - GitHub Actions 로그에서 상세 로그 확인
   - 각 시드키워드별 처리 결과 확인

2. **문제 원인 파악**
   - 로그를 기반으로 정확한 원인 파악
   - 필요한 경우 추가 조치

3. **설정 조정**
   - 문제 원인에 따라 설정 조정
   - 예: `minSearchVolume` 감소, 배치 크기 감소 등

## 🚨 긴급 조치

만약 계속해서 저장이 0개라면:

1. **수동 수집으로 임시 대응**
   ```bash
   # 모니터링 페이지에서 수동 수집 사용
   ```

2. **설정 임시 변경**
   - `minSearchVolume=1000` → `minSearchVolume=100`
   - `expandBatch=2000` → `expandBatch=100`

3. **API 키 확인**
   - Vercel 환경 변수 확인
   - API 키 추가 또는 교체

