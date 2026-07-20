# Turso 인덱스 생성 스크립트 (PowerShell)
# 사용법: .\turso\create_indexes_now.ps1

# turso CLI는 `turso auth login`으로 로그인된 세션을 사용합니다.
# TURSO_DATABASE_URL / TURSO_AUTH_TOKEN이 별도로 필요하면 실행 전 셸 환경에서 직접 설정하세요 (여기에 하드코딩하지 마세요).

Write-Host "🚀 Turso 인덱스 생성 시작..." -ForegroundColor Green
Write-Host "데이터베이스: nkeword-igeonu377" -ForegroundColor Cyan
Write-Host ""

# PowerShell에서 파일 내용을 파이프로 전달
Get-Content turso/step_by_step_indexes.sql | turso db shell nkeword-igeonu377

Write-Host ""
Write-Host "✅ 인덱스 생성 완료!" -ForegroundColor Green

