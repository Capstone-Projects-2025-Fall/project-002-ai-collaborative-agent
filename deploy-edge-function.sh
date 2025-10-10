#!/bin/bash

# Deploy Supabase Edge Function for OAuth Callback
# Make sure you have Supabase CLI installed: npm install -g supabase

echo "🚀 Deploying Supabase Edge Function for OAuth Callback..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if user is logged in
if ! supabase auth &> /dev/null; then
    echo "❌ Not logged in to Supabase. Please login first:"
    echo "   supabase login"
    exit 1
fi

# Deploy the function
echo "📦 Deploying auth-callback function..."
supabase functions deploy auth-callback

if [ $? -eq 0 ]; then
    echo "✅ Edge function deployed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Update your Supabase Dashboard settings:"
    echo "   - Site URL: https://your-project-id.supabase.co"
    echo "   - Redirect URLs: https://your-project-id.supabase.co/functions/v1/auth-callback"
    echo ""
    echo "2. Enable OAuth providers (Google & GitHub) in Supabase Dashboard"
    echo ""
    echo "3. Test your VS Code extension!"
else
    echo "❌ Failed to deploy edge function. Check the error messages above."
    exit 1
fi


