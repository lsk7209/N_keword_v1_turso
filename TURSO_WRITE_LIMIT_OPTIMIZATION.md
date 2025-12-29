# Turso Write 한도 초과 대응 및 최적화

## 🚨 현재 상황

- **Writes**: 62.29M / 25M (한도 초과!)
- **Reads**: 1.46B / 2.50B (여유 있음)
- **Storage**: 241.2 MB / 9 GB (여유 있음)

## ✅ 즉시 조치 완료

### 1. 자동 수집 중단
- ✅ Vercel Cron: 모든 cron job 주석 처리
- ✅ GitHub Actions: schedule 주석 처리 (workflow_dispatch로 수동 실행 가능)

### 2. 코드 최적화
- ✅ `mining-engine.ts`: 불필요한 SELECT/COUNT 쿼리 제거
  - 이전: 배치당 4회 Read (존재 확인 SELECT + 삽입 전/후 COUNT)
  - 현재: INSERT OR IGNORE만 실행 (Read 0회, Write만 발생)
  - **절약 효과**: 배치당 4회 Read 제거, Write는 동일하지만 불필요한 Read 제거로 전체 부하 감소

## 📊 최적화 효과

### Before (최적화 전)
- 배치당 쿼리: 1회 SELECT (존재 확인) + 1회 COUNT (삽입 전) + 1회 batch INSERT + 1회 COUNT (삽입 후) = **4회 Read + 1회 Write**
- 배치 크기: 1000개
- 자동 수집 빈도: 3분마다 5개 작업 (Vercel) + 5분마다 42회 호출 (GitHub Actions)

### After (최적화 후)
- 배치당 쿼리: 1회 batch INSERT OR IGNORE = **0회 Read + 1회 Write**
- 배치 크기: 1000개 (유지)
- 자동 수집: **중단됨** (수동 실행만 가능)

## 🔄 재활성화 가이드

### 1. Vercel Cron 재활성화 (보수적 설정)
```json
"crons": [
    {
        "path": "/api/miner/execute?task=expand&mode=TURBO&expandBatch=500&expandConcurrency=50&minSearchVolume=100&maxRunMs=58000",
        "schedule": "*/10 * * * *"  // 10분마다 (이전: 3분마다)
    },
    {
        "path": "/api/miner/execute?task=fill_docs&mode=TURBO&fillBatch=1000&fillConcurrency=200&maxRunMs=58000",
        "schedule": "*/10 * * * *"  // 10분마다 (이전: 3분마다)
    }
]
```

**변경 사항:**
- `expandBatch`: 2000 → 500 (75% 감소)
- `expandConcurrency`: 130 → 50 (62% 감소)
- `fillBatch`: 5000 → 1000 (80% 감소)
- `fillConcurrency`: 480 → 200 (58% 감소)
- `schedule`: 3분 → 10분 (70% 감소)

**예상 Write 감소:**
- 이전: 시간당 약 5개 작업 × 2000 배치 = 10,000 키워드/시간
- 이후: 시간당 약 1개 작업 × 500 배치 = 500 키워드/시간
- **약 95% Write 감소**

### 2. GitHub Actions 재활성화 (보수적 설정)
```yaml
on:
  schedule:
    - cron: '*/10 * * * *'  # 10분마다 (이전: 5분마다)
  workflow_dispatch:
```

```bash
RUN_FOR_SECONDS=180  # 3분간 실행 (이전: 7분)
INTERVAL_SECONDS=20  # 20초마다 호출 (이전: 10초)
QUERY="task=expand&mode=TURBO&expandBatch=500&expandConcurrency=50&minSearchVolume=100&maxRunMs=58000"
```

**변경 사항:**
- 실행 시간: 7분 → 3분 (57% 감소)
- 호출 간격: 10초 → 20초 (50% 감소)
- 배치 크기: 2000 → 500 (75% 감소)

**예상 Write 감소:**
- 이전: 5분마다 42회 호출 × 2000 배치 = 84,000 키워드/5분
- 이후: 10분마다 9회 호출 × 500 배치 = 4,500 키워드/10분
- **약 95% Write 감소**

## 💡 장기 대응 방안

### 1. Turso 플랜 업그레이드
- 현재: 무료 플랜 (25M writes/월)
- 옵션:
  - **Pro 플랜**: $29/월 (250M writes/월) - 10배 증가
  - **Scale 플랜**: $99/월 (2.5B writes/월) - 100배 증가

### 2. 데이터베이스 마이그레이션 고려
- **Supabase**: PostgreSQL 기반, 무료 플랜 500MB, Pro 플랜 $25/월
- **PlanetScale**: MySQL 기반, 무료 플랜 5GB, Pro 플랜 $29/월
- **Neon**: PostgreSQL 기반, 무료 플랜 0.5GB, Pro 플랜 $19/월

### 3. 추가 최적화 방안
1. **중복 키워드 사전 필터링**: 메모리에서 중복 제거 후 배치 삽입
2. **배치 크기 동적 조정**: Turso 사용량에 따라 자동 조정
3. **수집 전략 변경**: 고검색량 키워드만 우선 수집 (minSearchVolume 상향)

## 📈 모니터링

### Turso 대시보드 확인
1. [Turso Dashboard](https://turso.tech/dashboard) 접속
2. 사용량 탭에서 Write 사용량 확인
3. 월간 리셋 시점 확인 (매월 1일)

### 재활성화 후 모니터링 체크리스트
- [ ] Write 사용량이 일일 1M 이하로 유지되는지 확인
- [ ] 키워드 수집량이 목표치에 도달하는지 확인
- [ ] API 에러율이 5% 이하로 유지되는지 확인

## 🎯 권장 사항

1. **즉시**: 자동 수집 중단 상태 유지 (현재 완료)
2. **단기 (1주일 내)**: Turso 사용량 모니터링, 보수적 설정으로 재활성화 테스트
3. **중기 (1개월 내)**: 플랜 업그레이드 또는 마이그레이션 검토
4. **장기**: 데이터베이스 아키텍처 재검토 및 최적화

