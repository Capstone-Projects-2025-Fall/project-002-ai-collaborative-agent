Design Document - Part II API
=============================

### Agentic Progress Analysis (agentic-progress-analysis)

**Purpose:**

Generates an AI-based project/workspace progress report (as JSON) for a given project, based on a user prompt.

**Endpoint:**

  * **Method:** POST
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/agentic-progress-analysis`
  * **CORS:** OPTIONS supported; Access-Control-Allow-Origin: *

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "prompt": "string",
  "projectId": "string"
}
```

  * `prompt` (required): what the analysis should focus on
  * `projectId` (required): scopes the analysis to that project's indexed workspace

**Expected Output:**

Success (200):
```json
{
  "analysis": { }
}
```

  * `analysis`: AI-produced JSON object (structure may vary). If the AI output cannot be parsed as JSON, a fallback object is returned with a text summary plus basic sections (completion, blockers, next priorities).

**Errors:**

400:
```json
{ "error": "Missing prompt or projectId" }
```

500:
```json
{ "error": "..." }
```

Common causes: missing OPENAI_API_KEY, OpenAI API failure, invalid JSON request body, runtime/parsing issues.

**Dependencies / Notes:**

  * Required env vars: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  * Uses service role internally (privileged access; bypasses RLS)

-----

### AI Analyze (ai-analyze)

**Purpose:**

Reviews provided source files using OpenAI and returns a hint-based analysis of logic errors, a few quality improvements, and one "quick win" (no direct fixes).

**Endpoint:**

  * **Method:** POST
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/ai-analyze`
  * **CORS:** OPTIONS supported; Access-Control-Allow-Origin: *

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "files": [
    {
      "fileName": "string",
      "language": "string",
      "content": "string"
    }
  ],
  "folderPath": "string (optional)",
  "currentFile": "string (optional)",
  "changeContext": "string (optional)"
}
```

  * `files` (required): non-empty array of files to analyze
  * `folderPath`/`currentFile`/`changeContext` (optional): extra context included in the AI prompt

**Expected Output:**

Success (200):
```json
{
  "message": "string",
  "filesAnalyzed": 2,
  "folderPath": "string",
  "currentFile": "string"
}
```

  * `message`: AI-generated review text with issues referenced as filename.ext:line and written as hints
  * `filesAnalyzed`: number of files analyzed
  * `folderPath`/`currentFile`: echoed back if provided (may be omitted if not provided)

**Errors:**

400:
```json
{ "error": "Files parameter is required and must be a non-empty array" }
```

405:
```json
{ "error": "Method not allowed. Use POST." }
```

500:
```json
{ "error": "OpenAI API key not configured" }
```

500:
```json
{ "error": "Internal server error", "details": "..." }
```

Common causes: OpenAI API failure, invalid JSON request body, unexpected runtime errors.

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Uses OpenAI Chat Completions (model: gpt-4)
  * Adds line numbers to file content before sending to the model to improve filename:line references in the output

-----

### AI Chat (ai-chat)

**Purpose:**

Chat endpoint for an "AI Coding Mentor" that responds with guidance and hints (avoids full copy-paste solutions).

**Endpoint:**

  * **Method:** POST
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/ai-chat`
  * **CORS:** OPTIONS supported; Access-Control-Allow-Origin: *
  * **Note:** preflight response sets Allow-Origin and Allow-Headers, but does not explicitly set Access-Control-Allow-Methods.

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "messages": [
    { "role": "user", "content": "string" }
  ],
  "type": "string (optional)"
}
```

  * `messages` (required): non-empty array of chat messages (OpenAI-style objects like role + content)
  * `type` (optional): label returned back in the response (defaults to "chat")

**Expected Output:**

Success (200):
```json
{
  "message": "string",
  "success": true,
  "type": "chat"
}
```

  * `message`: the mentor-style AI response text
  * `success`: always true on success
  * `type`: echoes input type or defaults to "chat"

**Errors:**

400:
```json
{ "error": "Messages parameter is required and must be a non-empty array" }
```

405:
```json
{ "error": "Method not allowed. Use POST." }
```

500:
```json
{ "error": "OpenAI API key not configured" }
```

500:
```json
{ "error": "Internal server error", "details": "..." }
```

Common causes: OpenAI API failure, invalid JSON request body, unexpected runtime errors.

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Optional env var: OPENAI_MODEL (default: gpt-4o-mini)
  * Uses OpenAI Chat Completions; prepends a system prompt that enforces "hint-based mentoring" and discourages full code solutions.

-----

### Auth Callback (auth-callback)

**Purpose:**

Handles OAuth redirect callbacks for the AI Collab Agent VS Code extension. Reads OAuth tokens (or errors) from the callback URL and redirects back to VS Code using a vscode:// URI.

**Endpoint:**

  * **Method:** GET (typical OAuth callback), OPTIONS supported for CORS
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/auth-callback`
  * **CORS:** Access-Control-Allow-Origin: * (and allows common auth headers)

**Expected Input:**

Query parameters (from OAuth provider):

  * `access_token` (optional)
  * `refresh_token` (optional)
  * `error` (optional)
  * `error_description` (optional)
  * **Note:** Code also attempts to read these from the URL fragment (#...) if present.

**Expected Output:**

Success with token (200, text/html):

Returns an HTML page that redirects to:
```
vscode://ai-collab-agent.auth?access_token=...&refresh_token=...
```

Also shows a clickable fallback link if auto-redirect fails.

OAuth error (400, text/html):

Returns an HTML error page showing error and error_description.

No tokens provided (200, text/html):

Returns an HTML page explaining this is an OAuth callback handler and should be used via the VS Code extension.

**Errors:**

  * 400: OAuth error provided in query/fragment (HTML error page)
  * 500: Unexpected server error (HTML server error page)

**Dependencies / Notes:**

  * No environment variables required.
  * Returns HTML (not JSON). Designed to be used as an OAuth redirect/callback URL for the VS Code extension.

-----

### Code Analysis (code-analysis)

**Purpose:**

Reviews a provided code snippet and returns a structured AI critique (quality, best practices, performance, security, bug risks, recommendations).

**Endpoint:**

  * **Method:** POST (expects JSON body)
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/code-analysis`
  * **CORS:** Access-Control-Allow-Origin: * (on responses)

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "code": "string"
}
```

  * `code` (required): the code snippet to review (often highlighted code)

**Expected Output:**

Success (200):
```json
{
  "message": "string"
}
```

  * `message`: AI-generated review text

**Errors:**

500:
```json
{
  "error": "Internal server error",
  "details": "..."
}
```

Common causes: invalid JSON body, OpenAI API failure, missing OPENAI_API_KEY

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Uses OpenAI Chat Completions (model: gpt-4)
  * No explicit OPTIONS handler; browser CORS preflight may fail depending on how it is called
  * Sends submitted code to OpenAI; avoid including secrets in the input

-----

### Generate Embeddings (generate-embeddings)

**Purpose:**

Generates vector embeddings for an array of input texts using OpenAI, primarily for search/RAG indexing.

**Endpoint:**

  * **Method:** POST (expects JSON body)
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/generate-embeddings`
  * **CORS:** OPTIONS supported; Access-Control-Allow-Origin: *

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "texts": ["string"],
  "userId": "string",
  "projectId": "string (optional)"
}
```

  * `texts` (required): non-empty array of strings to embed
  * `userId` (required): used for rate limiting (not validated/authenticated in current code)
  * `projectId` (optional): used for logging only

**Expected Output:**

Success (200):
```json
{
  "embeddings": [[0.123, 0.456]],
  "usage": {
    "total_tokens": 123,
    "embedding_count": 1
  }
}
```

  * `embeddings`: array of embedding vectors (one per input text)
  * `usage`: token count (if provided by OpenAI) and number of embeddings returned

**Errors:**

400:
```json
{ "error": "texts array is required" }
```

400:
```json
{ "error": "userId is required" }
```

429:
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 20 embeddings per minute"
}
```

500:
```json
{
  "error": "Internal server error",
  "message": "..."
}
```

Common causes: missing OPENAI_API_KEY, OpenAI API failure, invalid JSON request body

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * OpenAI embeddings model: text-embedding-ada-002
  * Rate limit: 20 requests per userId per minute (in-memory; resets on cold starts and is not shared across instances)
  * Authorization is currently skipped (commented as development mode); callers can set any userId unless additional protections exist outside this function

-----

### Nudge Member (nudge-member)

**Purpose:**

Picks the best teammate to help with a code issue and returns a suggested "nudge" message (uses OpenAI to match by skills).

**Endpoint:**

  * **Method:** POST (expects JSON body), OPTIONS supported for CORS
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/nudge-member`
  * **CORS:** Access-Control-Allow-Origin: *
  * **Note:** preflight sets Allow-Origin and Allow-Headers, but does not explicitly set Access-Control-Allow-Methods.

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "codeSnippet": "string",
  "teamMembers": [
    {
      "id": "string",
      "name": "string",
      "skills": "string (optional)",
      "programmingLanguages": "string (optional)"
    }
  ],
  "currentUserId": "string",
  "currentUserName": "string (optional)",
  "languageId": "string (optional)",
  "fileName": "string (optional)",
  "diagnostics": [
    {
      "severity": 0,
      "message": "string",
      "range": { "start": { "line": 0 } }
    }
  ]
}
```

  * `codeSnippet` (required): snippet of code to analyze (truncated to ~2000 chars before sending to the model)
  * `teamMembers` (required): list of teammates to choose from (current user is excluded by id)
  * `currentUserId` (required): used to avoid recommending the current user
  * `languageId`/`fileName`/`diagnostics`/`currentUserName` (optional): extra context for matching

**Expected Output:**

Match found (200):
```json
{
  "success": true,
  "recommendedPeer": {
    "id": "string",
    "name": "string",
    "reason": "string"
  },
  "message": "string",
  "notificationMessage": "string",
  "confidence": 0.0,
  "problemDomain": "string"
}
```

No match (200):
```json
{
  "success": false,
  "message": "No suitable teammate found for this issue"
}
```

**Errors:**

400:
```json
{
  "success": false,
  "error": "Missing required fields: codeSnippet, teamMembers, currentUserId"
}
```

500:
```json
{
  "success": false,
  "error": "OpenAI API key not configured"
}
```

500:
```json
{
  "success": false,
  "error": "..."
}
```

Common causes: invalid JSON request body, OpenAI API failure, unexpected runtime errors.

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Optional env var: OPENAI_MODEL (default: gpt-4o-mini)
  * Uses OpenAI Chat Completions with JSON-formatted output for the match result

-----

### OpenAI Proxy (openai-proxy)

**Purpose:**

Securely proxies OpenAI API requests so clients do not need their own OpenAI API keys (server uses a single deployed key).

**Endpoint:**

  * **Method:** POST (expects JSON body), OPTIONS supported for CORS
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/openai-proxy`
  * **CORS:** Access-Control-Allow-Origin: *
  * **Allows methods:** POST, OPTIONS
  * **Allows headers:** authorization, x-client-info, apikey, content-type

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "endpoint": "chat/completions",
  "body": { }
}
```

  * `endpoint` (optional): OpenAI endpoint to call (default: "chat/completions")
      * Allowed values: "chat/completions", "embeddings"
  * `body` (required): request payload forwarded to OpenAI (must match OpenAI's expected schema for the chosen endpoint)

**Expected Output:**

Success (200):

Returns the OpenAI response JSON directly (unmodified), depending on the endpoint used.

**Errors:**

400:
```json
{ "error": "Invalid endpoint" }
```

500:
```json
{ "error": "..." }
```

Common causes: missing OPENAI_API_KEY, OpenAI API error, invalid JSON request body

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Only whitelisted OpenAI endpoints are allowed ("chat/completions" and "embeddings")
  * The 400 "Invalid endpoint" response does not include CORS headers, which may affect browser clients when reading that error response

-----

### Suggest Peer (suggest-peer)

**Purpose:**

Analyzes a developer's code context and suggests the best teammate to help, including a ready-to-send message (no code fixes).

**Endpoint:**

  * **Method:** POST (expects JSON body), OPTIONS supported for CORS
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/suggest-peer`
  * **CORS:** Access-Control-Allow-Origin: *
  * **Note:** preflight sets Allow-Origin and Allow-Headers, but does not explicitly set Access-Control-Allow-Methods.

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "codeSnippet": "string",
  "teamMembers": [
    {
      "id": "string",
      "name": "string",
      "skills": "string (optional)",
      "programmingLanguages": "string (optional)"
    }
  ],
  "currentUserId": "string",
  "languageId": "string (optional)",
  "fileName": "string (optional)",
  "cursorPosition": { "line": 0, "character": 0 },
  "diagnostics": [
    {
      "severity": 0,
      "message": "string",
      "range": { "start": { "line": 0 } }
    }
  ],
  "projectContext": {
    "name": "string",
    "description": "string (optional)",
    "goals": "string (optional)",
    "requirements": "string (optional)"
  }
}
```

  * `codeSnippet`, `teamMembers`, `currentUserId` are required (validated)
  * `cursorPosition` and `diagnostics` are expected (used when building the prompt)

**Expected Output:**

Success (200):
```json
{
  "hasSuggestion": true,
  "message": "string",
  "recommendedPeer": {
    "id": "string",
    "name": "string",
    "reason": "string"
  },
  "confidence": 0.0,
  "problemDomain": "string",
  "generatedQuestion": "string"
}
```

No suggestion (200):
```json
{ "hasSuggestion": false }
```

**Errors:**

400:
```json
{
  "hasSuggestion": false,
  "error": "Missing required fields in request"
}
```

500:
```json
{
  "hasSuggestion": false,
  "error": "OpenAI API key not configured"
}
```

500:
```json
{
  "hasSuggestion": false,
  "error": "..."
}
```

Common causes: invalid JSON request body, OpenAI API failure, missing expected fields (ex: cursorPosition), unexpected runtime errors.

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Optional env var: OPENAI_MODEL (default: gpt-4o-mini)
  * Sends a truncated codeSnippet (up to ~2000 chars) to OpenAI and requests JSON output for consistent parsing

-----

### Super Function (super-function)

**Purpose:**

Analyzes a project plus its team members and returns AI-generated recommendations for team optimization, role assignments, risks, and deliverables (often as JSON in the message text).

**Endpoint:**

  * **Method:** POST (expects JSON body)
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/super-function`
  * **CORS:** Access-Control-Allow-Origin: * (on responses)
  * **Note:** no explicit OPTIONS handler, so browser preflight may fail depending on how it is called.

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "project": {
    "name": "string (optional)",
    "created_at": "string or ISO date (optional)",
    "description": "string (optional)",
    "goals": "string (optional)",
    "requirements": "string (optional)"
  },
  "users": [
    {
      "name": "string (optional)",
      "skills": "string (optional)",
      "programming_languages": "string (optional)",
      "willing_to_work_on": "string (optional)"
    }
  ]
}
```

  * `project` (required): project details used in the AI prompt
  * `users` (required): array of team member objects used in the AI prompt

**Expected Output:**

Success (200):
```json
{
  "message": "string"
}
```

  * `message`: AI response text. The prompt requests valid JSON (teamAnalysis, feasibility, roleAssignments, optimization, risks, deliverables), but the function returns it as a string and does not enforce JSON output.

**Errors:**

400:
```json
{
  "error": "Missing required data",
  "details": "Both 'project' and 'users' are required"
}
```

500:
```json
{
  "error": "Configuration error",
  "details": "OPENAI_API_KEY is not set"
}
```

500:
```json
{
  "error": "Internal server error",
  "details": "..."
}
```

Common causes: invalid JSON request body, OpenAI API failure, unexpected runtime errors

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Uses OpenAI Chat Completions (model: gpt-4)
  * Expects users to be an array (the function calls users.map) even though it only checks that users is present
  * Response is always wrapped as { "message": "..." } even if the AI content itself is JSON

-----

### Validate Timeline Change (validate-timeline-change)

**Purpose:**

Evaluates whether a code diff is significant enough to create a development timeline point (feature/bugfix/refactor/style/docs/test). Returns a JSON decision.

**Endpoint:**

  * **Method:** POST (expects JSON body), OPTIONS supported for CORS
  * **URL:** `https://<project-ref>.supabase.co/functions/v1/validate-timeline-change`
  * **CORS:** Access-Control-Allow-Origin: *
  * **Allows methods:** POST
  * **Allows headers:** authorization, x-client-info, apikey, content-type

**Expected Input:**

Headers:
  * `Content-Type: application/json`

Body (JSON):
```json
{
  "codeBefore": "string (optional)",
  "codeAfter": "string",
  "changeTypes": ["string (optional)"],
  "filePath": "string (optional)",
  "linesChanged": "number (optional)"
}
```

  * `codeAfter` is expected (used in the prompt)
  * `codeBefore` can be empty or missing (treated as empty file)
  * `changeTypes`/`filePath`/`linesChanged` are used as context for the decision

**Expected Output:**

Success (200):
```json
{
  "shouldCreatePoint": true,
  "isValidCode": true,
  "significance": "low|medium|high|critical",
  "category": "feature|bugfix|refactor|style|docs|test",
  "description": "string",
  "reasoning": "string"
}
```

**Errors:**

500:
```json
{
  "error": "string",
  "stack": "string",
  "shouldCreatePoint": true,
  "category": "feature",
  "description": "Code change detected",
  "significance": "medium"
}
```

**Note:** on failure, it defaults to shouldCreatePoint: true (allows timeline point creation if AI fails)

**Dependencies / Notes:**

  * Required env var: OPENAI_API_KEY
  * Uses OpenAI Chat Completions (model: gpt-4o) and expects JSON-only output from the model
  * No explicit POST-only enforcement (non-POST requests may error when JSON parsing fails)
