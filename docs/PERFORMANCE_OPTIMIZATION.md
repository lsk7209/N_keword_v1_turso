# 🚀 문서수 수집 성능 최적화 가이드

## 현재 최적화 설정

### GitHub Actions 크론 작업 (`.github/workflows/fill-docs.yml`)

**최적화된 파라미터:**
- `fillBatch=60`: 한 번에 60개 키워드 처리 (기존 44개 → 60개)
- `fillConcurrency=12`: 12개 키워드 동시 처리 (기존 8개 → 12개)
- `INTERVAL_SECONDS=25`: 25초마다 호출 (기존 30초 → 25초)
- `RUN_FOR_SECONDS=150`: 2.5분간 실행 (기존 2분 → 2.5분)

### 예상 처리량

**이론상 최대치:**
- 실행당: (150/25=6회) × 60개 = **360개 키워드**
- 하루: 360개 × 288회 = **103,680개 키워드**

**실제 안전한 처리량 (API 한도 고려):**
- 실행당: 약 **200-250개 키워드** (안정적)
- 하루: 약 **50,000-60,000개 키워드** (목표 달성)

**Search API 호출:**
- 각 키워드당 4개 호출 (blog, cafe, web, news)
- 하루 약 200,000-240,000회 호출
- 기본 9개 키 기준: 9 × 25,000 = 225,000 한도

---

## API 키 추가 시 최적화

### 현재 설정 (9개 API 키 기준)
```yaml
fillBatch=60
fillConcurrency=12
```

### API 키 추가 후 권장 설정

#### 12개 API 키 추가 시 (총 21개)
```yaml
fillBatch=70
fillConcurrency=16
```
- 하루 약 60,000-70,000개 키워드 처리 가능

#### 15개 API 키 추가 시 (총 24개)
```yaml
fillBatch=80
fillConcurrency=20
```
- 하루 약 70,000-80,000개 키워드 처리 가능

#### 20개 API 키 추가 시 (총 29개)
```yaml
fillBatch=100
fillConcurrency=24
```
- 하루 약 80,000-100,000개 키워드 처리 가능

---

## 설정 변경 방법

### 1. GitHub Actions 워크플로우 수정

`.github/workflows/fill-docs.yml` 파일에서 다음 라인 수정:

```yaml
QUERY="task=fill_docs&fillBatch=60&fillConcurrency=12&maxRunMs=55000"
```

**변경 예시 (12개 키 추가 시):**
```yaml
QUERY="task=fill_docs&fillBatch=70&fillConcurrency=16&maxRunMs=55000"
```

### 2. Vercel 환경 변수 추가

Vercel 대시보드 > Settings > Environment Variables에서:

1. `NAVER_SEARCH_API_KEYS` 변수 찾기
2. **Edit** 클릭
3. 새로운 API 키를 JSON 배열에 추가:
   ```json
   [
     {"id":"기존키1","secret":"기존시크릿1"},
     {"id":"기존키2","secret":"기존시크릿2"},
     ...
     {"id":"새키1","secret":"새시크릿1"},
     {"id":"새키2","secret":"새시크릿2"}
   ]
   ```
4. **Save** 클릭
5. 재배포 (자동 또는 수동)

---

## 성능 모니터링

### 확인 방법

1. **GitHub Actions 로그**
   - Actions 탭 > fill-docs 워크플로우
   - "총 처리된 키워드" 확인

2. **모니터링 페이지**
   - `/monitor` 접속
   - "최근 24시간 문서수" 확인
   - 증가 추이 모니터링

3. **실행 로그 분석**
   ```
   ✅ 성공: X회
   📊 총 처리된 키워드: XXX개
   ```

### 목표 달성 확인

**하루 목표: 50,000개 이상**
- 실행당 평균: 200개 이상
- 하루 총합: 50,000개 이상

**계산식:**
```
하루 처리량 = 실행당 평균 × 288회
```

---

## 주의사항

### 1. API 한도 관리
- 네이버 Search API: 키당 하루 25,000회
- 총 한도 = 키 개수 × 25,000
- 현재 설정은 한도 내에서 안전하게 작동

### 2. Vercel 타임아웃
- `maxRunMs=55000`: 55초 제한 (60초 타임아웃 방지)
- `fillBatch`가 너무 크면 타임아웃 가능
- 현재 60개는 안전한 범위

### 3. 동시 처리 제한
- `fillConcurrency`는 API 키 개수에 비례
- 너무 높으면 rate limit 발생 가능
- 권장: API 키 개수의 1.5-2배

---

## 문제 해결

### 처리량이 낮은 경우

1. **API 키 확인**
   - Vercel 환경 변수 확인
   - 키가 정상 작동하는지 확인

2. **파라미터 조정**
   - `fillBatch` 증가 (60 → 70)
   - `fillConcurrency` 증가 (12 → 16)
   - `INTERVAL_SECONDS` 감소 (25 → 20)

3. **로그 확인**
   - GitHub Actions 로그에서 에러 확인
   - rate limit 발생 여부 확인

### Rate Limit 발생 시

1. **동시 처리 감소**
   - `fillConcurrency` 감소 (12 → 10)

2. **간격 증가**
   - `INTERVAL_SECONDS` 증가 (25 → 30)

3. **배치 크기 조정**
   - `fillBatch` 감소 (60 → 50)

---

## 최적화 체크리스트

- [ ] API 키 추가 완료
- [ ] Vercel 환경 변수 업데이트 완료
- [ ] GitHub Actions 워크플로우 파라미터 조정 완료
- [ ] 첫 실행 후 로그 확인
- [ ] 하루 처리량 목표 달성 확인
- [ ] 모니터링 페이지에서 증가 추이 확인

---

## 참고

- **현재 설정**: 하루 약 50,000-60,000개 처리 가능
- **API 키 추가 시**: 더 많은 처리량 가능
- **안전한 범위**: API 한도의 80-90% 사용 권장

