import { describe, it, expect, vi } from "vitest";
import { FakeEventBus, FakeWorkerPort, FakeEmailPort } from "../ports/fakes";
import { PgBossEventBus } from "./pg-boss-event-bus";
import { PgBossWorkerAdapter } from "./pg-boss-worker-adapter";
import { registerWorkers } from "./workers";
import type { PgBoss } from "pg-boss";
import type { DomainEvent } from "../ports/event-bus";
import type { DbClient } from "../db/client";

const makeEvent = <T>(type: string, payload: T): DomainEvent<T> => ({
  type,
  aggregateId: "42",
  aggregateType: "facture",
  payload,
  occurredAt: new Date("2026-01-01T00:00:00Z"),
});

function makeMockBoss(): PgBoss {
  return {
    createQueue: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue("job-id"),
    insert: vi.fn().mockResolvedValue(["job-id"]),
    work: vi.fn().mockResolvedValue("worker-id"),
  } as unknown as PgBoss;
}

describe("PgBossEventBus — contrat adaptateur", () => {
  it("publish appelle boss.send avec le type et l'event comme data", async () => {
    const boss = makeMockBoss();
    const bus = new PgBossEventBus(boss);
    const event = makeEvent("FACTURE_PAYEE", { factureId: 1 });
    await bus.publish(event);
    expect(boss.send).toHaveBeenCalledOnce();
    expect(boss.send).toHaveBeenCalledWith("FACTURE_PAYEE", event);
  });

  it("publishMany groupe par type et appelle boss.insert par groupe (tout-ou-rien)", async () => {
    const boss = makeMockBoss();
    const bus = new PgBossEventBus(boss);
    const events = [
      makeEvent("FACTURE_PAYEE", { factureId: 1 }),
      makeEvent("FACTURE_PAYEE", { factureId: 2 }),
      makeEvent("DEVIS_ACCEPTE", { devisId: 3 }),
    ];
    await bus.publishMany(events);
    expect(boss.insert).toHaveBeenCalledTimes(2);
    const calls = (boss.insert as ReturnType<typeof vi.fn>).mock.calls as [string, { data: unknown }[]][];
    const factureCall = calls.find(([name]) => name === "FACTURE_PAYEE");
    expect(factureCall?.[1]).toHaveLength(2);
    const devisCall = calls.find(([name]) => name === "DEVIS_ACCEPTE");
    expect(devisCall?.[1]).toHaveLength(1);
  });

  it("publishMany type unique n'appelle boss.insert qu'une fois", async () => {
    const boss = makeMockBoss();
    const bus = new PgBossEventBus(boss);
    await bus.publishMany([makeEvent("FACTURE_PAYEE", {}), makeEvent("FACTURE_PAYEE", {})]);
    expect(boss.insert).toHaveBeenCalledOnce();
  });
});

describe("PgBossWorkerAdapter — contrat adaptateur", () => {
  it("register crée la queue puis appelle boss.work avec le bon type", async () => {
    const boss = makeMockBoss();
    const adapter = new PgBossWorkerAdapter(boss);
    adapter.register("FACTURE_PAYEE", async () => void 0);
    /* register chaîne createQueue().then(work) — on attend la résolution des microtâches. */
    await vi.waitFor(() => expect(boss.work).toHaveBeenCalledOnce());
    expect(boss.createQueue).toHaveBeenCalledWith("FACTURE_PAYEE");
    expect((boss.work as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("FACTURE_PAYEE");
  });
});

describe("FakeEventBus", () => {
  it("publish stocke l'event", async () => {
    const bus = new FakeEventBus();
    const event = makeEvent("FACTURE_PAYEE", { factureId: 1 });
    await bus.publish(event);
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0].type).toBe("FACTURE_PAYEE");
  });

  it("publishMany stocke tous les events dans l'ordre", async () => {
    const bus = new FakeEventBus();
    const events = [
      makeEvent("FACTURE_PAYEE", { factureId: 1 }),
      makeEvent("DEVIS_ACCEPTE", { devisId: 2 }),
    ];
    await bus.publishMany(events);
    expect(bus.published).toHaveLength(2);
    expect(bus.published[0].type).toBe("FACTURE_PAYEE");
    expect(bus.published[1].type).toBe("DEVIS_ACCEPTE");
  });

  it("getPublished filtre par type", async () => {
    const bus = new FakeEventBus();
    await bus.publish(makeEvent("FACTURE_PAYEE", {}));
    await bus.publish(makeEvent("DEVIS_ACCEPTE", {}));
    expect(bus.getPublished("FACTURE_PAYEE")).toHaveLength(1);
    expect(bus.getPublished("DEVIS_ACCEPTE")).toHaveLength(1);
    expect(bus.getPublished()).toHaveLength(2);
  });
});

describe("FakeWorkerPort", () => {
  it("register stocke le handler, trigger l'exécute", async () => {
    const workers = new FakeWorkerPort();
    const received: unknown[] = [];
    workers.register("FACTURE_PAYEE", async (event) => { received.push(event.payload); });

    const event = makeEvent("FACTURE_PAYEE", { factureId: 99 });
    await workers.trigger("FACTURE_PAYEE", event);
    expect(received).toEqual([{ factureId: 99 }]);
  });

  it("trigger lance une erreur si aucun handler enregistré", async () => {
    const workers = new FakeWorkerPort();
    const event = makeEvent("INCONNU", {});
    await expect(workers.trigger("INCONNU", event)).rejects.toThrow(/handler/);
  });

  it("registeredTypes liste les types enregistrés en convention dot-notation FR", () => {
    const workers = new FakeWorkerPort();
    registerWorkers(workers, { email: new FakeEmailPort(), db: {} as DbClient });
    expect(workers.registeredTypes()).toEqual(expect.arrayContaining([
      "facture.payee",
      "devis.accepte",
      "devis.signe",
      "abonnement.expire",
    ]));
  });

  it("devis.signe — envoie email artisan ET email client de confirmation", async () => {
    const workers = new FakeWorkerPort();
    const email = new FakeEmailPort();
    const db = {
      select: (cols: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: () => {
              if ("userId" in cols) return Promise.resolve([{ userId: 1 }]);
              if ("email" in cols) return Promise.resolve([{ email: "artisan@test.com" }]);
              if ("signataireEmail" in cols) return Promise.resolve([{ signataireEmail: "client@test.com" }]);
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    } as unknown as DbClient;
    registerWorkers(workers, { email, db });
    await workers.trigger("devis.signe", {
      type: "devis.signe", aggregateType: "devis", aggregateId: 99, artisanId: 1, userId: null, occurredAt: new Date(), payload: { devisId: 99 },
    });
    expect(email.sent).toHaveLength(2);
    expect(email.sent.some((m) => m.to === "artisan@test.com")).toBe(true);
    expect(email.sent.some((m) => m.to === "client@test.com")).toBe(true);
  });
});
