// AI generates a backlog from project description entered from users

//uses plain text output

import * as vscode from "vscode";
import fetch from "node-fetch";

export type AiResult = { text: string };

/**
  Generate backlog text from  project description
  Tries the local endpoint first if configured (`aiTasks.apiEndpoint`)
  Falls back to OpenAI Responses API (plain text; no `text.format`)
 */
export async function generateBacklogFromDescription(description: string): Promise<AiResult> {
  const cfg = vscode.workspace.getConfiguration();

  const localEndpoint = (cfg.get<string>("aiTasks.apiEndpoint") || "").trim();
  const openaiKey     = (cfg.get<string>("ai.openaiApiKey")   || "").trim();
  const openaiProject = (cfg.get<string>("ai.openaiProject")  || "").trim(); // optional header
  const openaiModel   = (cfg.get<string>("ai.openaiModel")    || "gpt-5").trim();

  const prompt = buildPrompt(description);

  // 1) Try local AI endpoint first (if dev function running)
  if (localEndpoint) {
    try {
      const r = await fetch(localEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }), // keep the local contract simple
      });

      if (!r.ok) throw new Error(`Local AI ${r.status}`);

      const data = await r.json().catch(() => ({} as any));
      const text = (data?.text ?? data?.output ?? data?.result ?? "").toString().trim();
      if (text) return { text };
      // if empty, fall through to OpenAI
    } catch (e) {
      console.warn("[ai.ts] Local endpoint failed → falling back to OpenAI:", e);
    }
  }

  //  OpenAI Responses API 
  if (!openaiKey) {
    throw new Error("OpenAI key is missing. Set `ai.openaiApiKey` or configure `aiTasks.apiEndpoint`.");
  }

  // intentionally set `text` to avoid `text.format` errors.
  const body: Record<string, unknown> = {
    model: openaiModel,
    input: prompt, // Responses API expects input
  };

  // Debug: log exactly what is sent (helps verify right text format)
  console.log("[ai.ts] OpenAI request body:", JSON.stringify(body));

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${openaiKey}`,
    "Content-Type": "application/json",
  };
  if (openaiProject) headers["OpenAI-Project"] = openaiProject;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Print raw error text for easier debugging in the dev console
    const errText = await res.text().catch(() => "");
    console.error("[ai.ts] OpenAI error payload:", errText);
    throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // Prefer output in SDK format (`output_text`) if present; otherwise derive from `output`
  const text =
    (data?.output_text && String(data.output_text)) ||
    extractTextFromOutput(data) ||
    "";

  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error("OpenAI returned no text. Check model/project settings or try a longer description.");
  }

  return { text: cleaned };
}

/** Builds a focused prompt that asks for checklist-style tasks that Jira can consume (fed to AI). */
function buildPrompt(description: string): string {
  return [
    "You are a senior product/engineering planner.",
    "Given the project description, produce a concise backlog as plain text:",
    "",
    "• Optional epics and user stories (short).",
    "• Acceptance criteria bullets (Given/When/Then).",
    "• A FLAT list of TASKS, each on its own line prefixed exactly with '- [ ] '",
    "",
    "Project description:",
    "```",
    description,
    "```",
  ].join("\n");
}

/** Extract concatenated text from the Responses API's raw HTTP `output` format */
function extractTextFromOutput(resp: any): string | null {
  const parts = resp?.output;
  if (!Array.isArray(parts)) return null;
  const chunks: string[] = [];
  for (const p of parts) {
    if (Array.isArray(p?.content)) {
      for (const c of p.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
        else if (typeof c?.text === "string") chunks.push(c.text);
      }
    }
  }
  return chunks.length ? chunks.join("") : null;
}
