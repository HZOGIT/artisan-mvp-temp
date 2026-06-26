import { describe, it, expect, beforeEach } from "vitest";
import { genererAlertesReconductionContrats } from "./alertes-reconduction-use-cases";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { FakeNotificationRepository } from "../../notifications/infra/notification-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx: TenantContext = { artisanId: 1, userId: 0 };

function inDays(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

const BASE = {
  clientId: 42,
  titre: "Contrat entretien",
  montantHT: "100.00",
  periodicite: "annuel" as const,
  dateDebut: new Date("2025-01-01"),
  reconduction: true,
};

describe("genererAlertesReconductionContrats", () => {
  let contratRepo: FakeContratRepository;
  let notificationRepo: FakeNotificationRepository;

  beforeEach(() => {
    contratRepo = new FakeContratRepository();
    notificationRepo = new FakeNotificationRepository();
  });

  it("crée une notification pour un contrat dans la fenêtre 1–3 mois", async () => {
    const c = await contratRepo.create(ctx, { ...BASE, dateFin: inDays(60) }, "CTR-00001");

    const result = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);

    expect(result.alertsCreated).toBe(1);
    const notifs = await notificationRepo.list(ctx);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].lien).toBe(`/contrats/${c.id}`);
    expect(notifs[0].type).toBe("alerte");
  });

  it("pose alerteReconductionEnvoyeeLe après notification (idempotence)", async () => {
    const c = await contratRepo.create(ctx, { ...BASE, dateFin: inDays(60) }, "CTR-00001");

    await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);
    const result2 = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);

    expect(result2.alertsCreated).toBe(0);
    expect(await notificationRepo.list(ctx)).toHaveLength(1);
    const updated = await contratRepo.getById(ctx, c.id);
    expect(updated?.alerteReconductionEnvoyeeLe).not.toBeNull();
  });

  it("ignore les contrats dont dateFin est dans moins d'1 mois (trop tard)", async () => {
    await contratRepo.create(ctx, { ...BASE, dateFin: inDays(10) }, "CTR-00001");
    const result = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);
    expect(result.alertsCreated).toBe(0);
  });

  it("ignore les contrats dont dateFin est dans plus de 3 mois (trop tôt)", async () => {
    await contratRepo.create(ctx, { ...BASE, dateFin: inDays(120) }, "CTR-00001");
    const result = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);
    expect(result.alertsCreated).toBe(0);
  });

  it("ignore les contrats non actifs", async () => {
    const c = await contratRepo.create(ctx, { ...BASE, dateFin: inDays(60) }, "CTR-00001");
    await contratRepo.setStatut(ctx, c.id, "suspendu");
    const result = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);
    expect(result.alertsCreated).toBe(0);
  });

  it("ignore les contrats sans reconduction tacite", async () => {
    await contratRepo.create(ctx, { ...BASE, dateFin: inDays(60), reconduction: false }, "CTR-00001");
    const result = await genererAlertesReconductionContrats(contratRepo, notificationRepo, ctx);
    expect(result.alertsCreated).toBe(0);
  });
});
