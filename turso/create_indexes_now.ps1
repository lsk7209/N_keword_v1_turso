# Turso 인덱스 생성 스크립트 (PowerShell)
# 사용법: .\turso\create_indexes_now.ps1

# 환경 변수 설정
$env:TURSO_DATABASE_URL = "libsql://nkeword-igeonu377.aws-ap-northeast-1.turso.io"
$env:TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjYwMTM1NjIsImlkIjoiOTdmODdhYTQtY2E1MS00NWNhLWJhZWItYzBhMjQ3Y2JhZWM5IiwicmlkIjoiYzllZWNhMWMtMmM3MS00ZjA2LTk4M2QtYzBkYTM2NmM2ZjcxIn0.8odlDbEiAl-Cq61vRNOrey6jjuHfQmAO1A57laXz_tNxzmRc79D5d7Pa6r4brtjam8gTrxDjEmpyTL36gOIOCQ"

Write-Host "🚀 Turso 인덱스 생성 시작..." -ForegroundColor Green
Write-Host "데이터베이스: nkeword-igeonu377" -ForegroundColor Cyan
Write-Host ""

# PowerShell에서 파일 내용을 파이프로 전달
Get-Content turso/step_by_step_indexes.sql | turso db shell nkeword-igeonu377

Write-Host ""
Write-Host "✅ 인덱스 생성 완료!" -ForegroundColor Green

