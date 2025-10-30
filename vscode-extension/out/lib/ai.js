"use strict";
// AI generates a backlog from project description entered from users
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBacklogFromDescription = generateBacklogFromDescription;
//uses plain text output
const vscode = __importStar(require("vscode"));
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
  Generate backlog text from  project description
  Tries the local endpoint first if configured (`aiTasks.apiEndpoint`)
  Falls back to OpenAI Responses API (plain text; no `text.format`)
 */
async function generateBacklogFromDescription(description) {
    const cfg = vscode.workspace.getConfiguration();
    const localEndpoint = (cfg.get("aiTasks.apiEndpoint") || "").trim();
    const openaiKey = (cfg.get("ai.openaiApiKey") || "").trim();
    const openaiProject = (cfg.get("ai.openaiProject") || "").trim(); // optional header
    const openaiModel = (cfg.get("ai.openaiModel") || "gpt-5").trim();
    const prompt = buildPrompt(description);
    // 1) Try local AI endpoint first (if dev function running)
    if (localEndpoint) {
        try {
            const r = await (0, node_fetch_1.default)(localEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description }), // keep the local contract simple
            });
            if (!r.ok)
                throw new Error(`Local AI ${r.status}`);
            const data = await r.json().catch(() => ({}));
            const text = (data?.text ?? data?.output ?? data?.result ?? "").toString().trim();
            if (text)
                return { text };
            // if empty, fall through to OpenAI
        }
        catch (e) {
            console.warn("[ai.ts] Local endpoint failed → falling back to OpenAI:", e);
        }
    }
    //  OpenAI Responses API 
    if (!openaiKey) {
        throw new Error("OpenAI key is missing. Set `ai.openaiApiKey` or configure `aiTasks.apiEndpoint`.");
    }
    // intentionally set `text` to avoid `text.format` errors.
    const body = {
        model: openaiModel,
        input: prompt, // Responses API expects input
    };
    // Debug: log exactly what is sent (helps verify right text format)
    console.log("[ai.ts] OpenAI request body:", JSON.stringify(body));
    const headers = {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
    };
    if (openaiProject)
        headers["OpenAI-Project"] = openaiProject;
    const res = await (0, node_fetch_1.default)("https://api.openai.com/v1/responses", {
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
    const text = (data?.output_text && String(data.output_text)) ||
        extractTextFromOutput(data) ||
        "";
    const cleaned = text.trim();
    if (!cleaned) {
        throw new Error("OpenAI returned no text. Check model/project settings or try a longer description.");
    }
    return { text: cleaned };
}
/** Builds a focused prompt that asks for checklist-style tasks that Jira can consume (fed to AI). */
function buildPrompt(description) {
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
function extractTextFromOutput(resp) {
    const parts = resp?.output;
    if (!Array.isArray(parts))
        return null;
    const chunks = [];
    for (const p of parts) {
        if (Array.isArray(p?.content)) {
            for (const c of p.content) {
                if (c?.type === "output_text" && typeof c?.text === "string")
                    chunks.push(c.text);
                else if (typeof c?.text === "string")
                    chunks.push(c.text);
            }
        }
    }
    return chunks.length ? chunks.join("") : null;
}
//# sourceMappingURL=ai.js.map