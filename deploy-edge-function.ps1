# PowerShell script to deploy the send-team-invite edge function

Write-Host "Deploying send-team-invite Edge Function..." -ForegroundColor Green

# Navigate to the social-api-demo directory
Set-Location -Path "social-api-demo"

# Deploy the function
npx supabase functions deploy send-team-invite

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Test the function by sending an invite from your app." -ForegroundColor Yellow
