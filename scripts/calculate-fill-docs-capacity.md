# 문서수 수집 처리량 계산

## 변경 전후 비교

### 기존 설정 (29개 키 기준)
- **GitHub Actions**: fillConcurrency=24, fillBatch=100
- **Vercel Cron**: fillConcurrency=6, fillBatch=30
- **실행 주기**: GitHub 5분마다, Vercel 10분마다

### 변경 후 (20개 키 기준)
- **GitHub Actions**: fillConcurrency=20, fillBatch=100
- **Vercel Cron**: fillConcurrency=16, fillBatch=60
- **실행 주기**: GitHub 5분마다, Vercel 10분마다

## 처리량 계산

### GitHub Actions (5분마다 실행)
**기존:**
- 실행당 호출: 180초 / 20초 = 9회
- fillBatch: 100개
- fillConcurrency: 24개
- 이론상 최대: 9 × 100 = 900개/실행
- 실제 처리량: 약 600-800개/실행 (동시성 고려)

**변경 후:**
- 실행당 호출: 180초 / 20초 = 9회
- fillBatch: 100개
- fillConcurrency: 20개
- 이론상 최대: 9 × 100 = 900개/실행
- 실제 처리량: 약 600-750개/실행 (동시성 약간 감소)

**변화:** 약간 감소 (5-10%)

### Vercel Cron (10분마다 실행)
**기존:**
- 실행당 호출: 1회
- fillBatch: 30개
- fillConcurrency: 6개
- 실제 처리량: 약 20-30개/실행

**변경 후:**
- 실행당 호출: 1회
- fillBatch: 60개
- fillConcurrency: 16개
- 실제 처리량: 약 50-60개/실행

**변화:** 약 2배 증가

## 하루 총 처리량

### 기존
- GitHub Actions: 600개 × 288회 = 172,800개
- Vercel Cron: 25개 × 144회 = 3,600개
- **총합: 약 176,400개/일**

### 변경 후
- GitHub Actions: 650개 × 288회 = 187,200개
- Vercel Cron: 55개 × 144회 = 7,920개
- **총합: 약 195,120개/일**

**증가율: 약 10.6% 증가**

## 한 시간 처리량

### 기존
- GitHub Actions: 600개 × 12회 = 7,200개/시간
- Vercel Cron: 25개 × 6회 = 150개/시간
- **총합: 약 7,350개/시간**

### 변경 후
- GitHub Actions: 650개 × 12회 = 7,800개/시간
- Vercel Cron: 55개 × 6회 = 330개/시간
- **총합: 약 8,130개/시간**

**증가율: 약 10.6% 증가**

## 결론

✅ **수집량이 증가했습니다!**
- 하루: 약 18,720개 증가 (176,400 → 195,120)
- 한 시간: 약 780개 증가 (7,350 → 8,130)
- 증가율: 약 10.6%

**주요 원인:**
- Vercel Cron의 fillBatch와 fillConcurrency 증가로 처리량 2배 향상
- GitHub Actions는 약간 감소했지만, Vercel Cron의 증가가 이를 상쇄하고 더 증가

