import { describe, it, expect } from "vitest";
import { FakeEventBus, FakeWorkerPort } from "../ports/fakes";
import { registerWorkers } from "./workers";
import type { DomainEvent } from "../ports/event-bus";

const makeEvent = <T>(type: string, payload: T): DomainEvent<T> => ({
  type,
  aggregateId: "42",
  aggregateType: "facture",
  payload,
  occurredAt: new Date("2026-01-01T00:00:00Z"),
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

  it("registeredTypes liste les types enregistrés", () => {
    const workers = new FakeWorkerPort();
    registerWorkers(workers);
    expect(workers.registeredTypes()).toEqual(expect.arrayContaining([
      "FACTURE_PAYEE",
      "DEVIS_ACCEPTE",
      "SIGNATURE_COMPLETE",
      "ABONNEMENT_EXPIRE",
    ]));
  });
});
