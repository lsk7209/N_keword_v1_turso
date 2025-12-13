# Manual API Test Script
$secret = "$env:CRON_SECRET"
$url = "https://000-n-gold-key.vercel.app/api/miner/manual?key=$secret"
$body = @{
    keywords = @("답례품")
} | ConvertTo-Json

Write-Host "Testing manual collection API..."
Write-Host "URL: $url"
Write-Host "Body: $body"
Write-Host ""

$response = Invoke-WebRequest -Uri $url -Method Post -ContentType "application/json" -Body $body
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
