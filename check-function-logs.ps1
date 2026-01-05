# PowerShell script to check Edge Function logs

Write-Host "Fetching send-team-invite function logs..." -ForegroundColor Green

# Navigate to the social-api-demo directory
Set-Location -Path "social-api-demo"

# Get the logs
npx supabase functions logs send-team-invite

Write-Host "`nEnd of logs" -ForegroundColor Green
