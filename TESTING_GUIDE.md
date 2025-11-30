# Testing Guide: Collaborative AI Hint Feature

This guide will help you test all the new Collaborative AI Hint features.

## Prerequisites

1. **Supabase CLI** installed (for deploying Edge Functions)
2. **OpenAI API Key** (to be set in Supabase Edge Function secrets)
3. **VS Code Extension Development Host** ready
4. **At least one project with team members** in the extension

## Step 1: Set Up the Supabase Edge Function

1. **Set Environment Variables in Supabase Dashboard:**
   - Go to your Supabase project dashboard: https://supabase.com/dashboard
   - Navigate to **Project Settings** → **Edge Functions** → **Secrets**
   - Add the following secrets:
     - `OPENAI_API_KEY`: Your OpenAI API key (e.g., `sk-...`)
     - `OPENAI_MODEL`: (Optional) Model to use, defaults to `gpt-4o-mini`

2. **Deploy the Edge Function:**
   ```bash
   cd supabase
   supabase functions deploy suggest-peer
   ```

   If you haven't linked your project yet:
   ```bash
   supabase link --project-ref ptthofpfrmhhmvmbzgxx
   supabase functions deploy suggest-peer
   ```

3. **Verify the deployment:**
   - Check the Supabase dashboard → Edge Functions
   - The `suggest-peer` function should be listed and active

**Note:** The Edge Function runs on Supabase's infrastructure, so you don't need to keep any local service running.

## Step 2: Test the Extension

### 2.1 Build and Launch the Extension

1. Open the `vscode-extension` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. A new VS Code window will open - this is your test environment

### 2.2 Set Up Your Test Environment

1. **Log in to the extension:**
   - In the Extension Development Host window, press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "AI Collab Agent: Open" and press Enter
   - Log in if prompted

2. **Create or select a project:**
   - In the extension panel, go to the "Projects" tab
   - Create a new project or select an existing one
   - Make sure the project has at least 2 team members (including yourself)

3. **Set an active project:**
   - Go to the "AI Prompts" tab
   - Select a project from the dropdown - this automatically sets it as the active project
   - OR manually select a project in the projects list

## Step 3: Test Individual Features

### Test 1: Verify Edge Function Setup

1. Check that the `suggest-peer` Edge Function is deployed in Supabase dashboard
2. Verify that `OPENAI_API_KEY` is set in Edge Function secrets
3. The extension will automatically use the Supabase Edge Function (no local service needed)

**Expected Result:** Edge Function is deployed and configured correctly.

### Test 2: Active Project Tracking

1. Open the extension panel (AI Collab Agent: Open)
2. Go to "AI Prompts" tab
3. Select a project from the dropdown
4. Check the console (in the original VS Code window) for: "Active project set to: [project-id]"

**Expected Result:** Active project is tracked and stored in extension context.

### Test 3: Editor Monitoring & Struggle Detection

The feature automatically monitors your code editor. Test it by:

1. **Open a code file** in the Extension Development Host
2. **Create a syntax error:**
   ```typescript
   function test() {
     console.log("test"
     // Missing closing parenthesis
   }
   ```
   Wait 5 seconds after typing

3. **Add a TODO comment:**
   ```typescript
   // TODO: Fix this function
   function brokenFunction() {
     // ...
   }
   ```
   Wait 5 seconds after typing

4. **Add a FIXME comment:**
   ```typescript
   // FIXME: This needs optimization
   function slowFunction() {
     // ...
   }
   ```
   Wait 5 seconds after typing

5. **Import a complex library:**
   ```typescript
   import * as tf from '@tensorflow/tfjs';
   // or
   import React from 'react';
   ```
   Wait 5 seconds after typing

**Expected Result:** After 5 seconds of inactivity, the extension should detect struggle indicators and trigger a peer suggestion check.

### Test 4: Peer Suggestion Flow

1. **Ensure prerequisites:**
   - AI inference service is running (`npm start` in `ai-inference-service`)
   - You have an active project selected
   - The project has team members with different skills
   - You're logged into the extension

2. **Trigger a struggle indicator:**
   - Open a code file
   - Add a TODO comment or create a syntax error
   - Wait 5-10 seconds

3. **Check for suggestion:**
   - A VS Code notification should appear
   - It should suggest a team member based on the problem domain
   - Example: "Hey, this seems like a tricky React state issue. Alice Johnson is an expert in Frontend Development and React. Why not reach out to her for a quick chat?"

**Expected Result:** 
- Notification appears with peer suggestion
- Message is user-friendly and non-intrusive
- No direct code solutions are provided

### Test 5: Suggestion Actions

When a suggestion notification appears:

1. **Click "Ask [Peer Name] Now":**
   - A new markdown file should open in a side panel
   - The file should contain:
     - Project context
     - Code context
     - Reason for reaching out
     - A template for your question

2. **Click "Dismiss":**
   - Notification should disappear
   - No file should be created

**Expected Result:** 
- "Ask Peer" creates a collaboration scratchpad
- "Dismiss" closes the notification
- Scratchpad contains relevant context

### Test 6: Duplicate Prevention

1. Trigger a suggestion (add TODO comment, wait)
2. Dismiss the notification
3. Immediately trigger another suggestion (add another TODO, wait)
4. **Expected:** No duplicate suggestion should appear within 10 minutes for the same context

### Test 7: No Suggestion Scenarios

Test cases where no suggestion should appear:

1. **No active project:**
   - Don't select any project
   - Add a TODO comment
   - **Expected:** No suggestion (no project context)

2. **No team members:**
   - Select a project with only yourself as a member
   - Add a TODO comment
   - **Expected:** No suggestion (no peers to suggest)

3. **Edge Function not deployed or API key missing:**
   - If the Edge Function isn't deployed or OPENAI_API_KEY isn't set
   - Add a TODO comment
   - **Expected:** No suggestion (service unavailable, error logged in extension console)

## Step 4: Integration Testing

### Test Full Workflow

1. **Ensure Edge Function is deployed:**
   - Verify `suggest-peer` function is deployed in Supabase
   - Check that `OPENAI_API_KEY` is set in Edge Function secrets

2. **Launch extension** (F5 in vscode-extension folder)

3. **Set up project:**
   - Log in
   - Create/select project with team members
   - Select project in "AI Prompts" tab

4. **Write code with struggle:**
   ```typescript
   // TODO: Need help with database optimization
   async function queryDatabase() {
     // Complex query that might need optimization
     const result = await db.query('SELECT * FROM users WHERE ...');
     return result;
   }
   ```

5. **Wait and observe:**
   - After 5 seconds, extension detects struggle
   - Sends request to AI service
   - AI service analyzes and suggests peer
   - Notification appears with suggestion

6. **Interact with suggestion:**
   - Click "Ask [Peer] Now"
   - Verify scratchpad opens with context

## Step 5: Debugging

### Check Extension Logs

1. In the original VS Code window (not Extension Development Host)
2. Open "Output" panel (View → Output)
3. Select "Log (Extension Host)" from dropdown
4. Look for:
   - "Active project set to: [id]"
   - "Error in peer suggestion check: [error]"
   - "Supabase Edge Function error: [error]"

### Check Edge Function Logs

In the Supabase dashboard:
1. Go to **Edge Functions** → **suggest-peer**
2. Click on **Logs** tab
3. You should see:
- Request received logs
- LLM API calls
- Response sent logs
- Any errors

### Common Issues

1. **"Supabase Edge Function error: 404"**
   - Solution: Deploy the Edge Function: `supabase functions deploy suggest-peer`
   - Verify the function name matches in `supabaseConfig.ts`

2. **"No suggestion appears"**
   - Check: Is an active project selected?
   - Check: Does the project have team members?
   - Check: Are you logged in?
   - Check: Is the Edge Function deployed?
   - Check: Is OPENAI_API_KEY set in Supabase Edge Function secrets?

3. **"OpenAI API key not configured" error in Edge Function logs**
   - Solution: Go to Supabase dashboard → Edge Functions → Secrets
   - Add `OPENAI_API_KEY` secret with your OpenAI API key

4. **"No team members available"**
   - Solution: Add team members to your project in the extension UI

## Step 6: Manual API Testing (Optional)

You can test the Edge Function directly using curl:

```bash
curl -X POST https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/suggest-peer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "codeSnippet": "// TODO: Fix this\nfunction test() { }",
    "languageId": "typescript",
    "cursorPosition": { "line": 0, "character": 0 },
    "diagnostics": [],
    "projectContext": {
      "id": "test-project",
      "name": "Test Project",
      "description": "A test project",
      "goals": "Test goals",
      "requirements": "Test requirements"
    },
    "teamMembers": [
      {
        "id": "user1",
        "name": "Alice",
        "skills": "Frontend Development, React",
        "programmingLanguages": "JavaScript, TypeScript"
      },
      {
        "id": "user2",
        "name": "Bob",
        "skills": "Backend Development, Database",
        "programmingLanguages": "Python, SQL"
      }
    ],
    "currentUserId": "current-user"
  }'
```

Expected response:
```json
{
  "hasSuggestion": true,
  "message": "...",
  "recommendedPeer": {
    "id": "user1",
    "name": "Alice",
    "reason": "..."
  },
  "confidence": 0.85,
  "problemDomain": "..."
}
```

## Step 7: Verify All Features

Checklist:
- [ ] API key can be set via command
- [ ] Active project is tracked when selected
- [ ] Editor monitoring detects TODO/FIXME comments
- [ ] Editor monitoring detects syntax errors
- [ ] Editor monitoring detects complex imports
- [ ] Peer suggestions appear after struggle detection
- [ ] Suggestions are relevant to problem domain
- [ ] "Ask Peer" button opens scratchpad
- [ ] "Dismiss" button closes notification
- [ ] Duplicate suggestions are prevented
- [ ] No suggestions when no active project
- [ ] No suggestions when no team members
- [ ] Edge Function handles errors gracefully
- [ ] Extension handles Edge Function unavailability

## Troubleshooting

### Extension not detecting struggles
- Check that you're waiting 5 seconds after typing
- Verify the file is a code file (not plain text)
- Check extension logs for errors

### Edge Function not responding
- Verify function is deployed in Supabase dashboard
- Check OpenAI API key is set in Edge Function secrets
- Review Edge Function logs in Supabase dashboard
- Test the function directly with curl (see Step 6)

### Suggestions not appearing
- Verify active project is set
- Check project has team members
- Ensure you're logged into extension
- Check extension logs for errors

## Next Steps

After testing, you can:
1. Customize the debounce delay (default: 5 seconds)
2. Adjust duplicate prevention window (default: 10 minutes)
3. Add more complex library patterns to detect
4. Enhance the prompt engineering in `promptBuilder.js`
5. Add more struggle indicators (e.g., frequent undos, prolonged inactivity)

