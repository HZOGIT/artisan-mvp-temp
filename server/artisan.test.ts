import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "artisan@example.com",
    name: "Test Artisan",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("auth.me", () => {
  it("returns user when authenticated", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-123");
    expect(result?.email).toBe("artisan@example.com");
  });

  it("returns null when not authenticated", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });
});

describe("articles.getBibliotheque", () => {
  it("returns articles from the library", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.articles.getBibliotheque({});

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("filters articles by category", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.articles.getBibliotheque({ categorie: "plomberie" });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // All returned articles should be in plomberie category
    result.forEach((article: { categorie: string | null }) => {
      expect(article.categorie).toBe("plomberie");
    });
  });

  it("searches articles by term", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.articles.search({ query: "tube" });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dashboard.getStats", () => {
  it("returns dashboard statistics for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getStats();

    expect(result).toBeDefined();
    // Check that the result has the expected structure
    expect(result).toHaveProperty("caMonth");
    expect(result).toHaveProperty("caYear");
    expect(result).toHaveProperty("devisEnCours");
    expect(result).toHaveProperty("facturesImpayees");
    expect(result).toHaveProperty("totalClients");
  });
});

describe("clients router", () => {
  it("lists clients for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.clients.list();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("devis router", () => {
  it("lists devis for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.devis.list({});

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("factures router", () => {
  it("lists factures for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.factures.list({});

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("interventions router", () => {
  it("lists interventions for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.interventions.list({});

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("notifications router", () => {
  it("lists notifications for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.list();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns unread count for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.getUnreadCount();

    expect(result).toBeDefined();
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
