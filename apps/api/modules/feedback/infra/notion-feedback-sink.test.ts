import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotionFeedbackSink } from "./notion-feedback-sink";

const mockFetch = vi.fn();
beforeEach(() => { mockFetch.mockClear(); vi.stubGlobal("fetch", mockFetch); });
afterEach(() => { vi.unstubAllGlobals(); });

const sink = new NotionFeedbackSink("tok", "db-id", "Staging");

describe("NotionFeedbackSink.submit", () => {
  it("construit le bon payload avec les propriétés DB réelles", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await sink.submit({ type: "bug", message: "page blanche", page: "/dashboard", email: "u@t.fr" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.notion.com/v1/pages");
    const body = JSON.parse(init.body as string);
    expect(body.properties["Titre"].title[0].text.content).toBe("[BUG] page blanche");
    expect(body.properties["Description"].rich_text[0].text.content).toBe("page blanche");
    expect(body.properties["URL concernée"].url).toBe("/dashboard");
    expect(body.properties["Email"].email).toBe("u@t.fr");
    expect(body.properties["Environnement"].select.name).toBe("Staging");
    expect(body.properties["Name"]).toBeUndefined();
    expect(body.properties["Type"]).toBeUndefined();
  });

  it("tronque le titre à 80 chars", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const msg = "a".repeat(100);
    await sink.submit({ type: "suggestion", message: msg, email: "u@t.fr" });
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.properties["Titre"].title[0].text.content).toBe(`[SUGGESTION] ${"a".repeat(80)}`);
    expect(body.properties["URL concernée"].url).toBeNull();
  });

  it("retourne { ok: false } si Notion répond non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await sink.submit({ type: "bug", message: "err", email: "u@t.fr" });
    expect(result).toEqual({ ok: false });
  });
});

describe("NotionFeedbackSink.syncSchema", () => {
  it("ne PATCH pas si Email existe déjà", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ properties: { Email: { type: "email" } } }) });
    await sink.syncSchema();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("PATCH pour créer Email si absent", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ properties: { Titre: { type: "title" } } }) })
      .mockResolvedValueOnce({ ok: true });
    await sink.syncSchema();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string).properties["Email"]).toEqual({ email: {} });
  });

  it("throw si GET échoue", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(sink.syncSchema()).rejects.toThrow("notion GET database");
  });
});
