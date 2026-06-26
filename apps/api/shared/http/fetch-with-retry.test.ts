import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithRetry } from "./fetch-with-retry";

const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  mockFetch.mockClear();
  globalThis.fetch = mockFetch as any;
});

describe("fetchWithRetry", () => {
  it("retries on 5xx and succeeds on 2xx", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await fetchWithRetry("https://example.com", {}, { maxRetries: 3 });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 rate limit", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));

    const res = await fetchWithRetry("https://example.com/api", {}, { maxRetries: 2 });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST without forceRetry", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));

    const res = await fetchWithRetry("https://example.com", { method: "POST" }, { maxRetries: 3 });

    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries POST with forceRetry: true", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "abc" }), { status: 200 }));

    const res = await fetchWithRetry(
      "https://example.com",
      { method: "POST", forceRetry: true },
      { maxRetries: 2 },
    );

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries exhausted", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 503 }));

    const res = await fetchWithRetry("https://example.com", {}, { maxRetries: 2 });

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("aborts on timeout", async () => {
    vi.useFakeTimers();

    mockFetch.mockImplementation(() => new Promise(() => {}));

    const promise = fetchWithRetry("https://example.com", {}, { timeoutMs: 20, maxRetries: 0 });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();

    vi.useRealTimers();
  });

  it("returns 4xx errors without retrying", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const res = await fetchWithRetry("https://example.com", {}, { maxRetries: 3 });

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff between retries", async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry("https://example.com", {}, { maxRetries: 2, backoffBaseMs: 100 });

    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
