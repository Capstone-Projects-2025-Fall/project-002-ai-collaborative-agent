/// <reference types="vitest" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIssuesFromBacklog, searchIssues } from "./jira";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
  __esModule: true,
}));

import fetch from "node-fetch";

const fetchMock = vi.mocked(fetch);

const successResponse = (key: string) => ({
  ok: true,
  json: async () => ({ key }),
  text: async () => "",
});

describe("jira helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("creates one Jira issue per parsed task and trims the base URL", async () => {
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return successResponse(`TEST-${call}`);
    });

    const backlog = [
      "- [ ] Setup repository",
      "- [ ] Configure CI pipeline",
      "- [ ] Ship MVP",
    ].join("\n");

    const result = await createIssuesFromBacklog({
      baseUrl: "https://sample.atlassian.net/",
      email: "dev@example.com",
      token: "abc123",
      projectKey: "SAMPLE",
      backlogMarkdown: backlog,
      minTasks: 1,
      maxTasks: 20,
    });

    expect(result).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sample.atlassian.net/rest/api/3/issue");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("dev@example.com:abc123").toString("base64")}`,
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(init?.body || "{}"));
    expect(body.fields.summary).toBe("Setup repository");
    expect(body.fields.project.key).toBe("SAMPLE");
  });

  it("throws when the backlog contains fewer tasks than the minimum", async () => {
    const backlog = "- [ ] Only one task";

    await expect(
      createIssuesFromBacklog({
        baseUrl: "https://sample.atlassian.net",
        email: "dev@example.com",
        token: "abc123",
        projectKey: "SAMPLE",
        backlogMarkdown: backlog,
        minTasks: 3,
        maxTasks: 20,
      })
    ).rejects.toThrow(/at least 3/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps issue creation using the Jira window even when backlog is huge", async () => {
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return successResponse(`TASK-${call}`);
    });

    const backlog = Array.from({ length: 40 }, (_, idx) => `- [ ] Task ${idx + 1}`).join("\n");

    const result = await createIssuesFromBacklog({
      baseUrl: "https://sample.atlassian.net",
      email: "dev@example.com",
      token: "abc123",
      projectKey: "SAMPLE",
      backlogMarkdown: backlog,
      minTasks: 1,
      maxTasks: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(25); // capped at 25 tasks
    expect(result).toHaveLength(25);
  });

  describe("searchIssues", () => {
    const auth = {
      baseUrl: "https://sample.atlassian.net/",
      email: "dev@example.com",
      token: "abc123",
    };

    it("calls the enhanced JQL endpoint with the flattened expand string", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          issues: [
            {
              id: "1",
              key: "AIC-1",
              fields: {
                summary: "Test summary",
                description: null,
                status: { id: "11", name: "To Do" },
              },
            },
          ],
        }),
        text: async () => "",
      } as any);

      const result = await searchIssues(auth, "AIC", {
        status: "To Do",
        search: 'agent "collab"',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://sample.atlassian.net/rest/api/3/search/jql");
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.jql).toContain('project = "AIC"');
      expect(body.jql).toContain('status = "To Do"');
      expect(body.jql).toContain('text ~ "agent ');
      expect(body.jql).toContain("collab");
      expect(body.expand).toBe("renderedFields");
      expect(body.startAt).toBeUndefined();
      expect(result).toHaveLength(1);
      expect(result[0]?.summary).toBe("Test summary");
    });

    it("falls back to the legacy search endpoint when the new API rejects the payload", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          '{"errorMessages":["Invalid request payload. Refer to the REST API documentation and try again."]}',
      } as any);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [] }),
        text: async () => "",
      } as any);

      await searchIssues(auth, "AIC");

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "https://sample.atlassian.net/rest/api/3/search/jql",
        expect.any(Object)
      );
      const legacyCall = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(legacyCall[0]).toBe("https://sample.atlassian.net/rest/api/3/search");
      const legacyBody = JSON.parse(String(legacyCall[1]?.body || "{}"));
      expect(legacyBody.startAt).toBe(0);
    });
  });
});
