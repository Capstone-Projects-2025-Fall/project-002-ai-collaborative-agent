# Suggest Peer Edge Function

This Supabase Edge Function handles peer suggestions for the Collaborative AI Hint feature.

## Setup

1. **Set Environment Variables in Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to Edge Functions → Settings
   - Add the following secrets:
     - `OPENAI_API_KEY`: Your OpenAI API key (e.g., `sk-...`)
     - `OPENAI_MODEL`: (Optional) Model to use, defaults to `gpt-4o-mini`

2. **Deploy the Function:**
   ```bash
   supabase functions deploy suggest-peer
   ```

## Usage

The function accepts POST requests with the following structure:

```json
{
  "codeSnippet": "string",
  "languageId": "string",
  "cursorPosition": { "line": 0, "character": 0 },
  "diagnostics": [...],
  "projectContext": { ... },
  "teamMembers": [...],
  "currentUserId": "string"
}
```

Returns:
```json
{
  "hasSuggestion": true,
  "message": "User-friendly suggestion message",
  "recommendedPeer": {
    "id": "string",
    "name": "string",
    "reason": "string"
  },
  "confidence": 0.85,
  "problemDomain": "string"
}
```

## Local Development

To test locally:
```bash
supabase functions serve suggest-peer
```

Then test with:
```bash
curl -X POST http://localhost:54321/functions/v1/suggest-peer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d @test-request.json
```

