# Migration Notes: From Local AI Service to Supabase Edge Functions

## What Changed

The Collaborative AI Hint feature has been migrated from a local Node.js service to Supabase Edge Functions, following the same pattern as the existing `ai-analyze` feature.

## Changes Made

### 1. Extension Code (`vscode-extension/src/`)
- **`peerSuggestionService.ts`**: Updated to call Supabase Edge Function instead of `localhost:5000`
- **`supabaseConfig.ts`**: Added `getPeerSuggestionEdgeFunctionUrl()` function
- Removed dependency on local AI inference service

### 2. New Supabase Edge Function
- **`supabase/functions/suggest-peer/index.ts`**: New Edge Function that handles peer suggestions
- Uses OpenAI API (API key stored in Supabase Edge Function secrets)
- Follows the same pattern as `ai-analyze` Edge Function

### 3. Removed/Deprecated
- **`ai-inference-service/`**: No longer needed (can be deleted)
  - The Node.js Express service is replaced by the Supabase Edge Function
  - All functionality moved to `supabase/functions/suggest-peer/`

## Setup Required

1. **Deploy the Edge Function:**
   ```bash
   cd supabase
   supabase functions deploy suggest-peer
   ```

2. **Set Environment Variables in Supabase Dashboard:**
   - Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
   - Add `OPENAI_API_KEY` with your OpenAI API key
   - Optionally add `OPENAI_MODEL` (defaults to `gpt-4o-mini`)

## Benefits

1. **No Local Service Required**: Edge Function runs on Supabase infrastructure
2. **Consistent Architecture**: Uses the same pattern as `ai-analyze`
3. **Centralized API Keys**: OpenAI API key stored securely in Supabase secrets
4. **Better Scalability**: Edge Functions auto-scale with demand
5. **Simplified Deployment**: One less service to manage

## Testing

See `TESTING_GUIDE.md` for updated testing instructions.

## Rollback (if needed)

If you need to use the local service temporarily:
1. Revert changes in `peerSuggestionService.ts` to use `localhost:5000`
2. Start the `ai-inference-service` locally
3. Note: This is not recommended as it diverges from the project architecture

