# Supabase Edge Function Setup for OAuth

This guide will help you set up the Supabase Edge Function to handle OAuth callbacks for your VS Code extension.

## Prerequisites

1. **Supabase CLI installed**:

   ```bash
   npm install -g supabase
   ```

2. **Supabase project created** (if not already done)

## Step 1: Initialize Supabase (if not already done)

```bash
# Navigate to your project root
cd /path/to/your/project

# Initialize Supabase (if not already done)
supabase init

# Link to your Supabase project
supabase link --project-ref your-project-id
```

## Step 2: Deploy the Edge Function

```bash
# Deploy the auth-callback function
supabase functions deploy auth-callback

# Verify the function is deployed
supabase functions list
```

## Step 3: Update Supabase Settings

1. **Go to your Supabase Dashboard** → **Authentication** → **Settings**

2. **Update the following settings**:

   - **Site URL**: `https://your-project-id.supabase.co`
   - **Redirect URLs**: `https://your-project-id.supabase.co/functions/v1/auth-callback`

3. **Enable OAuth Providers** (Google & GitHub):
   - Go to **Authentication** → **Providers**
   - Enable Google and GitHub
   - Add your OAuth credentials

## Step 4: Test the Setup

1. **Run your VS Code extension** (F5)
2. **Click Google or GitHub OAuth button**
3. **Complete authentication in browser**
4. **You should be redirected back to VS Code** with the main app opening

## How It Works

1. **User clicks OAuth button** → Browser opens with OAuth provider
2. **User authenticates** → OAuth provider redirects to Edge Function
3. **Edge Function receives tokens** → Extracts access/refresh tokens
4. **Edge Function redirects to VS Code** → `vscode://ai-collab-agent.auth?access_token=...`
5. **VS Code extension handles URI** → Sets Supabase session
6. **Main app opens** → User is authenticated

## Benefits of Edge Functions

✅ **No localhost required**  
✅ **Fully hosted on Supabase**  
✅ **Easy to deploy and maintain**  
✅ **Works on any machine**  
✅ **No additional services needed**  
✅ **Automatic scaling**

## Troubleshooting

### Function Not Deploying

```bash
# Check if you're logged in
supabase auth

# Login if needed
supabase login

# Try deploying again
supabase functions deploy auth-callback
```

### OAuth Not Working

1. **Check Supabase settings** - Make sure redirect URLs are correct
2. **Check OAuth provider settings** - Make sure redirect URLs match
3. **Check console logs** - Look for error messages in VS Code Developer Console

### Function Errors

```bash
# Check function logs
supabase functions logs auth-callback

# Test function locally
supabase functions serve auth-callback
```

## Environment Variables

The Edge Function doesn't need any environment variables - it uses the Supabase project configuration automatically.

## Security Notes

- The Edge Function is publicly accessible (this is intentional for OAuth callbacks)
- Tokens are passed via URL parameters (this is standard for OAuth flows)
- The function validates tokens and redirects securely to VS Code
- No sensitive data is stored in the Edge Function

## Customization

You can modify the Edge Function (`supabase/functions/auth-callback/index.ts`) to:

- Add custom error handling
- Log authentication events
- Add additional validation
- Customize the success/error pages


