// supabase/functions/suggest-peer/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Get OpenAI API key from environment (set in Supabase dashboard)
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

interface AIPeerSuggestionRequest {
  codeSnippet: string;
  languageId: string;
  cursorPosition: { line: number; character: number };
  fileName?: string; // File name for better question generation
  diagnostics: Array<{
    severity: number;
    message: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
  }>;
  projectContext: {
    id: string;
    name: string;
    description: string;
    goals: string;
    requirements: string;
  } | null;
  teamMembers: Array<{
    id: string;
    name: string;
    skills: string;
    programmingLanguages: string;
  }>;
  currentUserId: string;
  contextHash?: string;
}

interface AIPeerSuggestionResponse {
  hasSuggestion: boolean;
  message?: string;
  recommendedPeer?: {
    id: string;
    name: string;
    reason: string;
  };
  confidence?: number;
  problemDomain?: string;
  generatedQuestion?: string; // AI-generated ready-to-send question
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set in environment variables");
      return new Response(
        JSON.stringify({
          hasSuggestion: false,
          error: "OpenAI API key not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const request: AIPeerSuggestionRequest = await req.json();

    // Validate request structure
    if (!request.codeSnippet || !request.teamMembers || !request.currentUserId) {
      return new Response(
        JSON.stringify({
          hasSuggestion: false,
          error: "Missing required fields in request",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build the prompt using MCP context
    const prompt = buildPrompt(request);

    // Call OpenAI API
    const llmResponse = await callOpenAI(prompt);

    // Parse and validate response
    const response = parseLLMResponse(llmResponse);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing suggestion request:", error);
    return new Response(
      JSON.stringify({
        hasSuggestion: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildPrompt(request: AIPeerSuggestionRequest): string {
  const {
    codeSnippet,
    languageId,
    cursorPosition,
    fileName,
    diagnostics,
    projectContext,
    teamMembers,
    currentUserId,
  } = request;

  // Use provided file name or default
  const fileReference = fileName || "the current file";

  // Format diagnostics
  const diagnosticsText = diagnostics.length > 0
    ? diagnostics
        .map(
          (d) =>
            `  - [${d.severity === 0 ? "ERROR" : "WARNING"}] Line ${d.range.start.line + 1}: ${d.message}`
        )
        .join("\n")
    : "  - No diagnostics found";

  // Format team members
  const teamMembersText = teamMembers
    .map(
      (member) =>
        `  - ${member.name}:
    Skills: ${member.skills || "Not specified"}
    Programming Languages: ${member.programmingLanguages || "Not specified"}`
    )
    .join("\n\n");

  // Format project context
  const projectContextText = projectContext
    ? `Project: ${projectContext.name}
Description: ${projectContext.description || "N/A"}
Goals: ${projectContext.goals || "N/A"}
Requirements: ${projectContext.requirements || "N/A"}`
    : "No active project context";

  // Build the prompt
  const prompt = `You are an AI Collab Agent, an expert software mentor and team facilitator. Your primary objective is to analyze a developer's code context, identify when they might be struggling, and recommend a specific team member who possesses relevant expertise to assist them. 

CRITICAL RULES:
1. You MUST NEVER provide direct code solutions or fixes.
2. You MUST ONLY suggest a team member for collaboration.
3. You MUST provide a clear, user-friendly reason for the recommendation.
4. If no suitable peer is found, set hasSuggestion to false.

=== CODE CONTEXT ===
File: ${fileReference}
Language: ${languageId}
Cursor Position: Line ${cursorPosition.line + 1}, Character ${cursorPosition.character}

Code Snippet (around cursor):
\`\`\`${languageId}
${codeSnippet.substring(0, 2000)}
\`\`\`

=== DIAGNOSTICS ===
${diagnosticsText}

=== PROJECT CONTEXT ===
${projectContextText}

=== AVAILABLE TEAM MEMBERS ===
${teamMembersText || "No team members available"}

=== YOUR TASK ===
Analyze the code context and determine:
1. What is the nature of the problem/struggle? (e.g., "database query optimization", "React state management", "machine learning model tuning")
2. Which team member has the most relevant skills to help?
3. Why is this team member the best match?
4. Generate a ready-to-send question/message for the developer to copy-paste to the recommended peer

IMPORTANT: 
- Match the problem domain to team members' skills and programming languages.
- Consider both explicit skills and programming language expertise.
- If multiple peers are equally suitable, you can suggest the one with the strongest overall match.
- If no suitable peer is found, indicate this clearly.
- For the generatedQuestion: Extract function names, file references, or specific areas from the code snippet to make it specific and helpful.

=== OUTPUT FORMAT ===
You MUST respond with ONLY valid JSON in this exact structure:
{
  "hasSuggestion": true or false,
  "message": "User-friendly message acknowledging the problem and suggesting the peer",
  "recommendedPeer": {
    "id": "team member id",
    "name": "Team Member Name",
    "reason": "Brief reason why this peer is recommended based on their skills"
  },
  "confidence": 0.0 to 1.0,
  "problemDomain": "Brief description of the problem domain identified",
  "generatedQuestion": "A ready-to-send message formatted for direct copy-paste to the recommended peer"
}

CRITICAL: The "generatedQuestion" field MUST be a friendly, concise message ready to send via chat/Slack/email. Format:
- Start with "Hey [Peer Name]," or "Hi [Peer Name],"
- Mention the file name: "${fileReference}" (use this exact file name)
- Mention the specific function/area having issues (extract function names from code snippet if visible)
- Briefly describe the problem based on diagnostics and code context (1-2 sentences max)
- End with: "Can you help me debug it? Let's start a Live Share session please!"
- Keep it under 250 characters for quick copy-paste
- Make it conversational and friendly
- Example format: "Hey [Name], on file ${fileReference} I'm having issues with the function [functionName](). [Brief problem]. Can you help me debug it? Let's start a Live Share session please!"

Example successful response:
{
  "hasSuggestion": true,
  "message": "Hey, this seems like a tricky machine learning integration. James Smith has strong skills in Machine Learning and Python. Why not reach out to him for a quick chat?",
  "recommendedPeer": {
    "id": "user-123",
    "name": "James Smith",
    "reason": "Expert in Machine Learning and Python, which matches the tensorflow integration challenge"
  },
  "confidence": 0.85,
  "problemDomain": "Machine Learning Integration",
  "generatedQuestion": "Hey James, on file model_training.py I'm having issues with the function trainModel(). The tensorflow integration is throwing errors. Can you help me debug it? Let's start a Live Share session please!"
}

Example no-suggestion response:
{
  "hasSuggestion": false
}

Remember: NEVER provide code fixes. ONLY suggest collaboration with a peer.`;

  return prompt;
}

async function callOpenAI(prompt: string): Promise<string> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an AI Collab Agent, an expert software mentor and team facilitator. You analyze code context and recommend team members for collaboration. You NEVER provide direct code solutions.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: "json_object" }, // Request JSON response
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No response content from OpenAI");
    }

    return content;
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}

function parseLLMResponse(llmResponse: string): AIPeerSuggestionResponse {
  try {
    // Try to parse as JSON first
    let parsed: any;
    
    // Try to extract JSON from markdown code blocks
    const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim());
    } else {
      // Try to find JSON object in the response
      const jsonStart = llmResponse.indexOf("{");
      const jsonEnd = llmResponse.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        parsed = JSON.parse(llmResponse.substring(jsonStart, jsonEnd + 1));
      } else {
        parsed = JSON.parse(llmResponse);
      }
    }

    // Validate response structure
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid response format");
    }

    // Ensure hasSuggestion is boolean
    const hasSuggestion = Boolean(parsed.hasSuggestion);

    if (!hasSuggestion) {
      return {
        hasSuggestion: false,
      };
    }

    // Validate recommended peer structure
    if (!parsed.recommendedPeer || !parsed.recommendedPeer.name) {
      throw new Error("Missing recommendedPeer information");
    }

    return {
      hasSuggestion: true,
      message: parsed.message || "",
      recommendedPeer: {
        id: parsed.recommendedPeer.id || "",
        name: parsed.recommendedPeer.name,
        reason: parsed.recommendedPeer.reason || "",
      },
      confidence: parsed.confidence || 0.5,
      problemDomain: parsed.problemDomain || "",
      generatedQuestion: parsed.generatedQuestion || "",
    };
  } catch (error) {
    console.error("Error parsing LLM response:", error);
    // Fallback to no suggestion
    return {
      hasSuggestion: false,
    };
  }
}

