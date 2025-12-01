"use strict";
// Jira helpers: building description as ADF (Atlassian Document Format, readable format for jira)
//This file handles converting AI-generated text into valid Jira issues using the Jira REST API
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIssuesFromBacklog = createIssuesFromBacklog;
exports.searchIssues = searchIssues;
exports.createIssue = createIssue;
exports.updateIssue = updateIssue;
exports.deleteIssue = deleteIssue;
exports.assignIssue = assignIssue;
exports.getProjectStatuses = getProjectStatuses;
exports.getIssueTransitions = getIssueTransitions;
exports.transitionIssue = transitionIssue;
exports.findUserAccountId = findUserAccountId;
const node_fetch_1 = __importDefault(require("node-fetch")); // Used to make HTTP requests to Jira’s REST API from Node.js
async function createIssuesFromBacklog(opts) {
    /**
    Create Jira issues from a Markdown-like backlog
    - Parses lines like "- [ ] Task title" (or "- Task title")
    - Creates one Task issue per line
    - Description is sent as an ADF document (required by Jira v3 API)
   */
    const { baseUrl, email, token, projectKey, backlogMarkdown, minTasks, maxTasks } = opts; // Extract each value from the options object
    const maxAllowedTasks = Math.min(Math.max(maxTasks ?? 25, 10), 25); // clamp to 10-25 window
    const minAllowedTasks = Math.min(Math.max(minTasks ?? 10, 1), maxAllowedTasks); // ensure <= max
    const tasks = extractTasks(backlogMarkdown, maxAllowedTasks); // Parse task titles from the AI Markdown list (one title per bullet)
    if (tasks.length < minAllowedTasks) {
        throw new Error(`Only ${tasks.length} task(s) detected from AI, but at least ${minAllowedTasks} are required. Please provide a more detailed project description to generate additional tasks.`);
    }
    const auth = Buffer.from(`${email}:${token}`).toString("base64"); // this is needed because Jira’s API requires Basic Authentication: meaning that the email and token must be combined and Base64-encoded before being sent in the HTTP header for secure login
    const adfDoc = toAdf(backlogMarkdown); // Convert the backlog text into Jira’s ADF format for the issue description
    // Debug logs so we can see what we're sending
    console.log("[jira.ts] Parsed tasks:", tasks); // show first 500 chars                        * mark if too long
    console.log("[jira.ts] ADF preview:", JSON.stringify(adfDoc).slice(0, 500) + (JSON.stringify(adfDoc).length > 500 ? "…(truncated)" : ""));
    const results = []; // Array to store all created Jira issues 
    for (const title of tasks) { //Loop through each parsed task title and create one issue per line
        const payload = {
            fields: {
                project: { key: projectKey }, // specifying Jira project to issue tasks to
                summary: title, // issue title
                issuetype: { name: "Task" }, // set the issue type as "Task" so it can appear in backlog
                description: adfDoc, // formatted description (ADF)
            },
        };
        //Log what is being sent for debugging purposes
        console.log("[jira.ts] Creating issue payload:", JSON.stringify({ summary: title, projectKey }).slice(0, 200));
        const r = await (0, node_fetch_1.default)(`${trimSlash(baseUrl)}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`, // Basic Auth using email + token (encoded in Base64 so the API can verify users' identity)
                "Accept": "application/json", // expect JSON (because Jira’s REST API uses JSON as its standard data format) response
                "Content-Type": "application/json", // sending JSON(same thing as above) body
            },
            body: JSON.stringify(payload), // converts payload object (holding jira issue details (summary, description, and project)) into a JS string and attaches it to HTTP request body
        });
        if (!r.ok) { // If Jira responds with error (not OK), log and throw it
            const errText = await r.text().catch(() => "");
            console.error("[jira.ts] Jira error:", r.status, errText);
            throw new Error(`Jira ${r.status}: ${errText}`);
        }
        const data = await r.json(); //If success, parse returned JSON and save the created issue info
        results.push(data);
    }
    return results; // Return all created issues (debbuging purposes/ confirmation)
}
/*
  extractTasks()
  Pulls each line that looks like "- [ ] Do something" or "- Do something"
  Returns an array of clean task titles.
 */
function extractTasks(md, limit = 25) {
    const lines = md.split(/\r?\n/); // split markdown text into lines
    const tasks = [];
    for (const line of lines) { //
        // Checkboxes: - [ ] Task title
        let m = line.match(/^- \[\s?\]\s+(.*)$/i); //checks whether line of text match - [ ]. first, line must start with a ^- (-); second, \[\s?\] means that the dash(-) must be followed by [ with optional space ]; 
        //thrid \s, at least one space after [ ]; fourth (.*), captures all task's texta after ( - [ ] ); last /i makes the whole check for match case sensitive 
        if (m && m[1]) { //if the tasks generated by AI (m[1]) starting with -[] matches m above, trim the extra empty spaces below
            const title = m[1].replace(/\s+/g, " ").trim();
            if (title)
                tasks.push(title); //If a cleaned, non-empty task title was found, adds that title to the tasks list
            continue;
        }
        // Plain bullets: - Task title
        m = line.match(/^- (.+)$/); // check if the line starts with "- " followed by some text (plain bullet task)
        if (m && m[1]) { // make sure it actually matched and captured the task text
            const title = m[1].replace(/\s+/g, " ").trim(); // clean extra spaces inside the task text and trim edges
            if (title)
                tasks.push(title); // if the title is not empty, add it to the task list for later use
        }
    }
    return tasks.slice(0, limit); // safety cap with caller-provided limit
}
/**
 * Convert a markdown-like backlog into a simple, universally-accepted ADF document
 * We produce:
 *   doc(version=1)
 *     paragraph("Generated Backlog")
 *     bulletList(listItem(paragraph(lineText))) … for any leading '-' or '*'
 *     paragraph(lines that aren't bullets)
 */
function toAdf(md) {
    const lines = md.split(/\r?\n/); //Splits Markdown text (md) into an array of lines, breaking at each newline (\n or \r\n). So the code can go through the text line by line to detect bullets, checkboxes, or paragraphs
    const doc = { type: "doc", version: 1, content: [] }; // basic ADF doc skeleton (Creates a starting ADF (Atlassian Document Format) object with a version and an empty content list). Will later store all the formatted text blocks (like paragraphs and bullet lists)
    // header line at the top of description:
    doc.content.push(p("Generated Backlog"));
    // gather consecutive bullet lines into one bulletList
    let currentListItems = [];
    const flushList = () => {
        if (currentListItems.length > 0) {
            doc.content.push({
                type: "bulletList",
                content: currentListItems.map((li) => ({
                    type: "listItem",
                    content: [p(li)], // listItem → paragraph → text
                })),
            });
            currentListItems = []; // reset list buffer
        }
    };
    //Process each line in the Markdown backlog
    for (const raw of lines) {
        const line = raw.trimEnd(); // remove trailing spaces
        const isBullet = /^[-*]\s+/.test(line); // check if it is a Bullet or checkbox bullet
        const isCheckbox = /^-\s*\[\s?[xX]?\s?\]\s+/.test(line); //  won’t render actual checkbox ADF; keep as bullet text
        if (isBullet || isCheckbox) {
            // Clean out "- [ ] " or "- " symbols to keep only the task text
            const cleaned = line
                .replace(/^-\s*\[\s?[xX]?\s?\]\s+/, "") // remove "- [ ] " or "- [x] "
                .replace(/^[-*]\s+/, "") // remove "- " or "* "
                .trim();
            if (cleaned)
                currentListItems.push(cleaned); // add to list buffer
            continue;
        }
        // Non-bullet line: close any existing list and create a paragraph
        flushList();
        const plain = line.trim();
        if (plain.length > 0) {
            doc.content.push(p(plain)); // regular text paragraph
        }
        else {
            // keep empty lines to avoid extra empty nodes
            doc.content.push(p(" "));
        }
    }
    // Push any remaining list items at the end
    flushList();
    //Return the fully built ADF document
    return doc;
}
/** Helper: ADF paragraph node with plain text */
function p(text) {
    return {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
    };
}
function trimSlash(url) {
    //Prevents double slashes when joining with Jira API endpoint
    return url.replace(/\/+$/, "");
}
async function jiraRequest(auth, path, init = {}) {
    const authHeader = Buffer.from(`${auth.email}:${auth.token}`).toString("base64");
    const response = await (0, node_fetch_1.default)(`${trimSlash(auth.baseUrl)}${path}`, {
        method: init.method,
        body: init.body,
        headers: {
            "Authorization": `Basic ${authHeader}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const error = new Error(`Jira ${response.status}: ${errText}`);
        error.status = response.status;
        error.body = errText;
        throw error;
    }
    if (response.status === 204) {
        return {};
    }
    return (await response.json());
}
function mapIssues(data) {
    return (data?.issues?.map((issue) => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields?.summary ?? "",
        description: issue.fields?.description ?? null,
        status: {
            id: issue.fields?.status?.id,
            name: issue.fields?.status?.name,
        },
        assignee: issue.fields?.assignee
            ? {
                accountId: issue.fields.assignee.accountId,
                displayName: issue.fields.assignee.displayName || issue.fields.assignee.name || "",
                email: issue.fields.assignee.emailAddress || "",
            }
            : null,
        updated: issue.fields?.updated,
        priority: issue.fields?.priority?.name ?? null,
    })) ?? []);
}
async function executeSearch(auth, path, payload) {
    const data = await jiraRequest(auth, path, {
        method: "POST",
        body: JSON.stringify(payload),
    });
    console.log("[Jira] search response (issues)", data?.issues?.length ?? 0);
    const mapped = mapIssues(data);
    console.log(`[Jira] ${path} returned ${mapped.length} issues`);
    return mapped;
}
async function searchIssues(auth, projectKey, opts) {
    const jqlParts = [`project = "${projectKey}"`];
    if (opts?.status) {
        jqlParts.push(`status = "${opts.status}"`);
    }
    if (opts?.search) {
        const term = opts.search.replace(/"/g, '\\"');
        jqlParts.push(`text ~ "${term}"`);
    }
    const jqlQuery = jqlParts.join(" AND ");
    const baseFields = {
        maxResults: 50,
        fields: ["summary", "status", "assignee", "description", "updated", "priority"],
        expand: ["renderedFields"],
    };
    try {
        console.log("[Jira] Searching issues via /search/jql", jqlQuery);
        return await executeSearch(auth, "/rest/api/3/search/jql", {
            ...baseFields,
            expand: Array.isArray(baseFields.expand) ? baseFields.expand.join(",") : baseFields.expand,
            jql: jqlQuery,
        });
    }
    catch (err) {
        if (err?.status === 400 || (err?.message || "").includes("Invalid request payload")) {
            console.warn("[Jira] search/jql failed, falling back to legacy search endpoint:", err?.message);
            return await executeSearch(auth, "/rest/api/3/search", {
                startAt: 0,
                ...baseFields,
                expand: baseFields.expand,
                jql: jqlQuery,
            });
        }
        throw err;
    }
}
async function createIssue(auth, input) {
    const payload = {
        fields: {
            project: { key: input.projectKey },
            summary: input.summary,
            issuetype: { name: "Task" },
            description: toSimpleAdf(input.description ?? input.summary),
        },
    };
    return jiraRequest(auth, "/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
async function updateIssue(auth, issueIdOrKey, fields) {
    const payload = { fields: {} };
    if (fields.summary !== undefined) {
        payload.fields.summary = fields.summary;
    }
    if (fields.description !== undefined) {
        payload.fields.description = toSimpleAdf(fields.description);
    }
    return jiraRequest(auth, `/rest/api/3/issue/${issueIdOrKey}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}
async function deleteIssue(auth, issueIdOrKey) {
    return jiraRequest(auth, `/rest/api/3/issue/${issueIdOrKey}`, {
        method: "DELETE",
    });
}
async function assignIssue(auth, issueIdOrKey, accountId) {
    return jiraRequest(auth, `/rest/api/3/issue/${issueIdOrKey}/assignee`, {
        method: "PUT",
        body: JSON.stringify({ accountId }),
    });
}
async function getProjectStatuses(auth, projectKey) {
    const data = await jiraRequest(auth, `/rest/api/3/project/${projectKey}/statuses`);
    const statuses = [];
    for (const workflow of data ?? []) {
        for (const status of workflow.statuses ?? []) {
            if (status?.name && !statuses.includes(status.name)) {
                statuses.push(status.name);
            }
        }
    }
    return statuses;
}
async function getIssueTransitions(auth, issueIdOrKey) {
    const data = await jiraRequest(auth, `/rest/api/3/issue/${issueIdOrKey}/transitions`);
    return data?.transitions ?? [];
}
async function transitionIssue(auth, issueIdOrKey, transitionId) {
    return jiraRequest(auth, `/rest/api/3/issue/${issueIdOrKey}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId } }),
    });
}
async function findUserAccountId(auth, query) {
    if (!query) {
        return null;
    }
    const encoded = encodeURIComponent(query);
    const users = await jiraRequest(auth, `/rest/api/3/user/search?query=${encoded}`);
    if (Array.isArray(users) && users.length > 0) {
        return users[0].accountId;
    }
    return null;
}
function toSimpleAdf(text) {
    return {
        type: "doc",
        version: 1,
        content: [
            {
                type: "paragraph",
                content: text
                    ? [
                        {
                            type: "text",
                            text,
                        },
                    ]
                    : [],
            },
        ],
    };
}
//# sourceMappingURL=jira.js.map