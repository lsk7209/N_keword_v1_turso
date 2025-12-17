# PowerShell에서 실행: .\turso\RUN_THIS.ps1

Write-Host "🚀 Turso 인덱스 생성 시작..." -ForegroundColor Green
Write-Host "데이터베이스: nkeword-igeonu377" -ForegroundColor Cyan
Write-Host "예상 소요 시간: 15-25분" -ForegroundColor Yellow
Write-Host ""

# PowerShell 방식으로 파일 내용 전달
Get-Content turso/step_by_step_indexes.sql | turso db shell nkeword-igeonu377

Write-Host ""
Write-Host "✅ 인덱스 생성 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "확인하려면 다음 명령어 실행:" -ForegroundColor Cyan
Write-Host "turso db shell nkeword-igeonu377" -ForegroundColor White
Write-Host "그 다음: SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='keywords';" -ForegroundColor White

