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
    await seedStock(stocks, A, "REF-1", "Tube cuivre", true);
    await seedStock(stocks, A, "REF-2", "Coude PVC", true);
    await seedStock(stocks, A, "REF-OK", "Vis", false); // au-dessus du seuil → ignoré

    const res = await genererAlertesStock(stocks, notifs, ctx(A));

    expect(res.alertsCreated).toBe(2);
    const list = await notifs.list(ctx(A));
    expect(list.length).toBe(2);
    for (const n of list) {
      expect(n.type).toBe("alerte");
      expect(n.titre).toBe("Stock bas");
      expect(n.lien).toBe("/stocks");
    }
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

  it("behavior-preserving : pas de déduplication (2ᵉ appel recrée les alertes)", async () => {
    const stocks = new FakeStockRepository();
    const notifs = new FakeNotificationRepository();
    await seedStock(stocks, A, "REF-1", "Tube cuivre", true);

    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(1);
    expect((await genererAlertesStock(stocks, notifs, ctx(A))).alertsCreated).toBe(1);
    expect((await notifs.list(ctx(A))).length).toBe(2); // doublon assumé (parité legacy)
  });
});
