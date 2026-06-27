import { describe, it, expect, vi } from "vitest";
import { createFeedbackModule } from "./feedback.module";
import type { IFeedbackSink } from "./application/feedback-sink";
import type { FeedbackInput } from "./domain/feedback";
import type { AppContext } from "../../interface/trpc/context";

const warnSpy = vi.fn();
const fakeLog = { child: () => fakeLog, info: () => {}, warn: warnSpy, error: () => {} } as unknown as AppContext["log"];
const fakeTenant = { artisanId: 1, userId: 99 };
const fakeClaims = { userId: 99, email: "artisan@t.fr" };
const ctx = (over: Partial<AppContext> = {}): AppContext => ({
  claims: fakeClaims,
  tenant: fakeTenant,
  role: null,
  permissions: [],
  res: null,
  clientIp: "unknown",
  userAgent: "unknown",
  log: fakeLog,
  ...over,
});

class FakeFeedbackSink implements IFeedbackSink {
  readonly calls: FeedbackInput[] = [];
  async submit(input: FeedbackInput) { this.calls.push(input); return { ok: true }; }
}

describe("createFeedbackModule", () => {
  it("assemble un router avec la procédure submit", () => {
    const mod = createFeedbackModule({ notionToken: "tok", notionDatabaseId: "db" });
    const procedures = Object.keys((mod.router as unknown as { _def: { record: Record<string, unknown> } })._def.record);
    expect(procedures).toEqual(["submit"]);
  });

  it("sans token (noop sink) → submit retourne { ok: false }", async () => {
    const mod = createFeedbackModule({});
    const result = await mod.router.createCaller(ctx()).submit({ type: "bug", message: "crash" });
    expect(result).toEqual({ ok: false });
  });

  it("avec fake sink → payload email + type + message transmis", async () => {
    const sink = new FakeFeedbackSink();
    const mod = createFeedbackModule({ sink });
    await mod.router.createCaller(ctx()).submit({ type: "suggestion", message: "Mon idée", page: "/dashboard" });
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({ type: "suggestion", message: "Mon idée", page: "/dashboard", email: "artisan@t.fr" });
  });

  it("sink ok:false → log.warn déclenché", async () => {
    const failSink: IFeedbackSink = { submit: async () => ({ ok: false }) };
    const mod = createFeedbackModule({ sink: failSink });
    warnSpy.mockClear();
    const result = await mod.router.createCaller(ctx()).submit({ type: "bug", message: "err" });
    expect(result).toEqual({ ok: false });
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("avec token + databaseId → expose syncSchema", () => {
    const mod = createFeedbackModule({ notionToken: "tok", notionDatabaseId: "db" });
    expect(typeof mod.syncSchema).toBe("function");
  });

  it("sans token → syncSchema undefined", () => {
    const mod = createFeedbackModule({});
    expect(mod.syncSchema).toBeUndefined();
  });
});
