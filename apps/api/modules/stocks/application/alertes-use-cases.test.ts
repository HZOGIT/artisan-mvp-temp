import { describe, it, expect } from "vitest";
import { genererAlertesStock } from "./alertes-use-cases";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { FakeNotificationRepository } from "../../notifications/infra/notification-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 7710001;
const B = 7710002;

// Seede un stock pour un tenant. `bas` => quantité (2) <= seuil (5) → comptera comme stock bas.
async function seedStock(
  repo: FakeStockRepository,
  artisanId: number,
  reference: string,
  designation: string,
  bas: boolean,
) {
  return repo.create(ctx(artisanId), {
    reference,
    designation,
    quantiteEnStock: bas ? "2" : "10",
    seuilAlerte: "5",
    unite: "u",
  });
}

describe("genererAlertesStock (use-case cross-domaine stocks → notifications, fakes)", () => {
  it("aucun stock bas → 0 alerte, aucune notification créée", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    await seedStock(stocks, A, "REF-OK", "Vis", false);

    const res = await genererAlertesStock(stocks, notifs, ctx(A));

    expect(res.alertsCreated).toBe(0);
    expect(await notifs.list(ctx(A))).toEqual([]);
  });

  it("une notification « Stock bas » par item sous le seuil (type/lien/message)", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    const s1 = await seedStock(stocks, A, "REF-1", "Tube cuivre", true);
    const s2 = await seedStock(stocks, A, "REF-2", "Coude PVC", true);
    await seedStock(stocks, A, "REF-OK", "Vis", false); // au-dessus du seuil → ignoré

    const res = await genererAlertesStock(stocks, notifs, ctx(A));

    expect(res.alertsCreated).toBe(2);
    const list = await notifs.list(ctx(A));
    expect(list.length).toBe(2);
    for (const n of list) {
      expect(n.type).toBe("alerte");
      expect(n.titre).toBe("Stock bas");
    }
    // lien par article (id du stock dans la query string)
    const liens = list.map((n) => n.lien);
    expect(liens).toContain(`/stocks?id=${s1.id}`);
    expect(liens).toContain(`/stocks?id=${s2.id}`);
    // le message porte la désignation, la référence et le seuil
    const messages = list.map((n) => n.message).join(" | ");
    expect(messages).toContain("Tube cuivre");
    expect(messages).toContain("REF-1");
    expect(messages).toContain("seuil: 5.00");
  });

  it("scope tenant : générer pour A n'alerte QUE sur les stocks de A", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    await seedStock(stocks, A, "A-BAS", "Item A", true);
    await seedStock(stocks, B, "B-BAS", "Item B", true); // autre tenant → ne doit pas compter

    const res = await genererAlertesStock(stocks, notifs, ctx(A));

    expect(res.alertsCreated).toBe(1);
    expect((await notifs.list(ctx(A))).length).toBe(1);
    expect(await notifs.list(ctx(B))).toEqual([]); // aucune fuite vers B
  });

  it("déduplication : 2ᵉ appel ne recrée pas l'alerte tant qu'elle est active", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    await seedStock(stocks, A, "REF-1", "Tube cuivre", true);

    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(1);
    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(0);
    expect((await notifs.list(ctx(A))).length).toBe(1); // une seule alerte active
  });

  it("réarmement : alerte archivée quand le stock remonte, puis réémisetsi il redescend", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    const s = await seedStock(stocks, A, "REF-1", "Tube cuivre", true); // bas

    // 1ʳᵉ descente → alerte créée
    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(1);
    expect((await notifs.list(ctx(A))).length).toBe(1);

    // stock remonte au-dessus du seuil
    await stocks.adjustQuantity(ctx(A), s.id, { type: "entree", quantite: "20" });

    // cron suivant : alerte archivée (réarmement)
    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(0);
    const apresRemontee = await notifs.list(ctx(A), { includeArchived: true });
    expect(apresRemontee.every((n) => n.archived)).toBe(true);

    // stock redescend sous le seuil (22 - 18 = 4 ≤ seuil 5)
    await stocks.adjustQuantity(ctx(A), s.id, { type: "sortie", quantite: "18" });

    // cron suivant : nouvelle alerte créée
    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(1);
    const apresRebas = await notifs.list(ctx(A));
    expect(apresRebas.length).toBe(1); // 1 active (l'ancienne est archived)
  });
});
