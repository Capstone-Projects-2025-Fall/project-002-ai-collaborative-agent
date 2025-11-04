"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJiraTasksCmd = createJiraTasksCmd;
const vscode = __importStar(require("vscode"));
const ai_1 = require("../lib/ai");
const jira_1 = require("../lib/jira");
function sanitize(input) {
    return (input ?? "").trim();
}
async function ensureValue(current, promptOptions) {
    if (current) {
        return current;
    }
    const response = await vscode.window.showInputBox(promptOptions);
    return sanitize(response);
}
async function createJiraTasksCmd(ctx, options) {
    try {
        let baseUrl = sanitize(options?.baseUrl);
        let projectKey = sanitize(options?.projectKey);
        let email = sanitize(options?.email);
        let token = sanitize(options?.token);
        let description = sanitize(options?.description);
        baseUrl = await ensureValue(baseUrl, {
            prompt: "Jira Cloud base URL (e.g. https://your-team.atlassian.net)",
            ignoreFocusOut: true,
        });
        projectKey = await ensureValue(projectKey, {
            prompt: "Jira Project Key (e.g. STAR, TUFF, ENG)",
            ignoreFocusOut: true,
        });
        email = await ensureValue(email, {
            prompt: "Jira account email (the one tied to the API token)",
            ignoreFocusOut: true,
        });
        if (!token) {
            token = sanitize(await vscode.window.showInputBox({
                prompt: "Jira API Token",
                password: true,
                ignoreFocusOut: true,
            }));
        }
        if (!baseUrl || !projectKey || !email || !token) {
            throw new Error("Missing Jira credentials. Please provide base URL, project key, email, and API token.");
        }
        description = await ensureValue(description, {
            prompt: "Describe your project to generate a Jira backlog",
            placeHolder: "e.g., Build a fitness app that tracks workouts and suggests plans…",
            ignoreFocusOut: true,
        });
        if (!description) {
            vscode.window.showWarningMessage("Jira backlog creation cancelled: no project description provided.");
            return;
        }
        const ai = await (0, ai_1.generateBacklogFromDescription)(description);
        const created = await (0, jira_1.createIssuesFromBacklog)({
            baseUrl,
            email,
            token,
            projectKey,
            backlogMarkdown: ai.text,
        });
        const info = `Created ${created.length} Jira issue(s) in project ${projectKey}`;
        vscode.window.showInformationMessage(info);
        return created;
    }
    catch (err) {
        const msg = (err?.message || String(err)).slice(0, 1000);
        vscode.window.showErrorMessage(`Create Jira Tasks failed: ${msg}`);
        throw err;
    }
}
//# sourceMappingURL=createJiraTasks.js.map