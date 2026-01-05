# PowerShell script to set Resend API key in Supabase
# Make sure you're logged in to Supabase CLI first

Write-Host "Setting Resend API Key in Supabase..." -ForegroundColor Green

# Replace with your actual Resend API key
$RESEND_KEY = "re_LkUjQtbF_2wLzkzht7wGXoVToqbwGikJv"

# Set the secret
npx supabase secrets set RESEND_API_KEY="$RESEND_KEY"

Write-Host "`nDone! The RESEND_API_KEY has been set." -ForegroundColor Green
Write-Host "Now redeploy your function with: npx supabase functions deploy send-team-invite" -ForegroundColor Yellow
