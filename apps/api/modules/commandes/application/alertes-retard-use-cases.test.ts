import { describe, it, expect, beforeEach } from "vitest";
import { genererAlertesRetardLivraison } from "./alertes-retard-use-cases";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { FakeNotificationRepository } from "../../notifications/infra/notification-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx: TenantContext = { artisanId: 1, userId: 0 };
const FOURNISSEUR_ID = 10;

function yesterday(): Date {
  return new Date(Date.now() - 86_400_000);
}

function tomorrow(): Date {
  return new Date(Date.now() + 86_400_000);
}

describe("genererAlertesRetardLivraison", () => {
  let commandeRepo: FakeCommandeRepository;
  let notificationRepo: FakeNotificationRepository;

  beforeEach(() => {
    commandeRepo = new FakeCommandeRepository();
    notificationRepo = new FakeNotificationRepository();
    commandeRepo.seedFournisseur(FOURNISSEUR_ID, ctx.artisanId);
  });

  it("crée une notification pour chaque commande en retard non alertée", async () => {
    const c1 = await commandeRepo.create(ctx, {
      fournisseurId: FOURNISSEUR_ID,
      dateLivraisonPrevue: yesterday(),
      lignes: [{ designation: "Ciment", quantite: "10" }],
    });
    expect(c1).not.toBeNull();
    await commandeRepo.updateStatut(ctx, c1!.id, "confirmee");

    const result = await genererAlertesRetardLivraison(commandeRepo, notificationRepo, ctx);

    expect(result.alertsCreated).toBe(1);
    const notifs = await notificationRepo.list(ctx);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].lien).toBe(`/commandes/${c1!.id}`);
    expect(notifs[0].type).toBe("alerte");
  });

  it("pose alerteRetardEnvoyee = true après notification", async () => {
    const c = await commandeRepo.create(ctx, {
      fournisseurId: FOURNISSEUR_ID,
      dateLivraisonPrevue: yesterday(),
      lignes: [{ designation: "Sable", quantite: "5" }],
    });
    await commandeRepo.updateStatut(ctx, c!.id, "envoyee");

    await genererAlertesRetardLivraison(commandeRepo, notificationRepo, ctx);

    const updated = await commandeRepo.getById(ctx, c!.id);
    expect(updated?.alerteRetardEnvoyee).toBe(true);
  });

  it("ne crée pas de deuxième notification pour une commande déjà alertée", async () => {
    const c = await commandeRepo.create(ctx, {
      fournisseurId: FOURNISSEUR_ID,
      dateLivraisonPrevue: yesterday(),
      lignes: [{ designation: "Bois", quantite: "3" }],
    });
    await commandeRepo.updateStatut(ctx, c!.id, "confirmee");

    await genererAlertesRetardLivraison(commandeRepo, notificationRepo, ctx);
    const result2 = await genererAlertesRetardLivraison(commandeRepo, notificationRepo, ctx);

    expect(result2.alertsCreated).toBe(0);
    expect((await notificationRepo.list(ctx))).toHaveLength(1);
  });

  it("ignore les commandes dont la date prévue est dans le futur", async () => {
    const c = await commandeRepo.create(ctx, {
      fournisseurId: FOURNISSEUR_ID,
      dateLivraisonPrevue: tomorrow(),
      lignes: [{ designation: "Gravier", quantite: "2" }],
    });
    await commandeRepo.updateStatut(ctx, c!.id, "confirmee");

    const result = await genererAlertesRetardLivraison(commandeRepo, notificationRepo, ctx);
    expect(result.alertsCreated).toBe(0);
  });
});
