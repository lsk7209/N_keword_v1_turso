# ⚠️ API 키 설정이 필요합니다!

## 현재 상태
- ❌ **네이버 AD API 키**: 없음
- ❌ **네이버 SEARCH API 키**: 없음
- ⚠️ **자동 수집 상태**: API 키 없어 작동 안함

## GitHub Actions는 실행 중이지만...
5분마다 크론이 실행되고 있으나, API 키가 없어서 실제 수집은 0건입니다.

## 공격적인 수집을 위한 3단계

### 1️⃣ API 키 발급 및 설정 (최우선!)

#### 네이버 광고 API (키워드 확장용)
1. https://searchad.naver.com 접속
2. 도구 > API 관리 > API 키 발급
3. Customer ID, API Key, Secret Key 확보

#### 네이버 검색 API (문서 수 수집용)
1. https://developers.naver.com/apps 접속  
2. 애플리케이션 등록
3. Client ID, Client Secret 확보

#### 로컬 설정 (.env.local)
```bash
NAVER_AD_API_KEYS='[{"customerId":"1234567","apiKey":"YOUR_KEY","secretKey":"YOUR_SECRET"}]'
NAVER_SEARCH_API_KEYS='[{"clientId":"YOUR_ID","clientSecret":"YOUR_SECRET"}]'
```

#### Vercel 환경변수 설정
```bash
# Vercel 대시보드 > Settings > Environment Variables
NAVER_AD_API_KEYS = [위 값]
NAVER_SEARCH_API_KEYS = [위 값]
```

#### GitHub Secrets 설정
```bash
# GitHub > Settings > Secrets and variables > Actions
NAVER_AD_API_KEYS = [위 값]
NAVER_SEARCH_API_KEYS = [위 값]
```

### 2️⃣ 공격적인 파라미터 조정 (API 키 설정 후)

현재 설정:
- expandBatch: 200
- expandConcurrency: 30
- fillBatch: 300
- fillConcurrency: 80

공격적인 설정 (API 키 여러개 있을 경우):
```yaml
# .github/workflows/miner.yml
expandBatch=2000
expandConcurrency=130
minSearchVolume=50  # 100 → 50으로 낮춤 (더 많은 키워드 수집)

# .github/workflows/fill-docs.yml
fillBatch=5000
fillConcurrency=480
```

### 3️⃣ 크론 주기 단축 (선택사항)

현재: 5분마다  
공격적: 3분마다 또는 2분마다

```yaml
# miner.yml
# 기존: */5 * * * *
# 변경: */3 * * * *  (3분마다)
# 변경: */2 * * * *  (2분마다)
```

## ⚡ 최대 수집을 위한 권장사항

1. **API 키를 최대한 많이 확보**
   - AD API 키: 5-10개 이상
   - SEARCH API 키: 20-40개 이상
   - 동시성은 키 개수에 비례하여 자동 조정됨

2. **minSearchVolume 낮추기**
   - 현재 100 → 50 또는 10으로 낮추면 더 많은 키워드 수집
   - 단, Golden Ratio 계산 정확도는 떨어질 수 있음

3. **Vercel Pro 플랜 확인**
   - 무료 플랜: 동시 실행 제한 있음
   - Pro 플랜: 무제한 동시 실행

## 🚀 즉시 실행 순서

### Step 1: API 키 발급
→ 네이버 광고/검색 API 사이트 방문

### Step 2: 환경변수 설정
→ .env.local, Vercel, GitHub Secrets에 추가

### Step 3: 수집 확인
→ /monitor 페이지에서 실시간 확인

### Step 4: 파라미터 조정 (선택)
→ GitHub Actions workflow 파일 수정

---

**현재 상태**: API 키 없음 → **수집 0건/분**  
**API 키 1개 설정 후**: 약 **100-500건/분**  
**API 키 10개+ 공격적 설정**: 약 **1,000-10,000건/분**

API 키만 설정하면 즉시 자가증식 시작됩니다! 🔥
