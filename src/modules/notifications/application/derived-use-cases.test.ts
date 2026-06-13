import { describe, it, expect, beforeEach } from "vitest";
import { FakeNotificationRepository } from "../infra/notification-repository-fake";
import { genererRappelsFacturesEnRetard } from "./derived-use-cases";
import { listNotifications } from "./read-use-cases";
import type { TenantContext } from "../../../shared/tenant";
import type { FactureEnRetard } from "../domain/facture-en-retard";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const now = () => new Date("2026-06-13T00:00:00Z");

const facture = (id: number, numero: string, echeance: string, clientNom: string | null = "Dupont"): FactureEnRetard => ({
  id,
  numero,
  totalTTC: "1200.50",
  dateEcheance: new Date(echeance),
  clientNom,
});

describe("notifications — genererRappelsFacturesEnRetard (use-case dérivé)", () => {
  let repo: FakeNotificationRepository;

  beforeEach(() => {
    repo = new FakeNotificationRepository();
  });

  it("crée un rappel par facture en retard, scopé tenant, message formaté", async () => {
    repo.seedFacturesEnRetard(1, [facture(10, "F-2026-001", "2026-06-01")]);
    const res = await genererRappelsFacturesEnRetard(repo, A, now);
    expect(res.rappelsCreated).toBe(1);
    const [n] = await listNotifications(repo, A);
    expect(n.type).toBe("rappel");
    expect(n.titre).toBe("Facture F-2026-001 en retard");
    expect(n.message).toContain("Dupont");
    expect(n.message).toContain("12 jour(s)"); // 2026-06-01 → 2026-06-13
    expect(n.message).toContain("1200.50 €");
    expect(n.lien).toBe("/factures/10");
  });

  it("idempotent : un 2e passage ne recrée pas de rappel (lien actif existant)", async () => {
    repo.seedFacturesEnRetard(1, [facture(10, "F1", "2026-06-01")]);
    expect((await genererRappelsFacturesEnRetard(repo, A, now)).rappelsCreated).toBe(1);
    expect((await genererRappelsFacturesEnRetard(repo, A, now)).rappelsCreated).toBe(0);
    expect((await listNotifications(repo, A)).length).toBe(1);
  });

  it("isolation cross-tenant : les factures/rappels d'un tenant n'affectent pas l'autre", async () => {
    repo.seedFacturesEnRetard(1, [facture(10, "FA", "2026-06-01")]);
    repo.seedFacturesEnRetard(2, [facture(20, "FB", "2026-06-01")]);
    await genererRappelsFacturesEnRetard(repo, A, now);
    expect((await listNotifications(repo, A)).length).toBe(1);
    expect((await listNotifications(repo, B)).length).toBe(0); // B pas encore généré
    await genererRappelsFacturesEnRetard(repo, B, now);
    expect((await listNotifications(repo, B)).map((n) => n.lien)).toEqual(["/factures/20"]);
  });

  it("aucune facture en retard → 0 rappel", async () => {
    expect((await genererRappelsFacturesEnRetard(repo, A, now)).rappelsCreated).toBe(0);
  });

  it("client null → message « Client » par défaut, montant 0 toléré", async () => {
    repo.seedFacturesEnRetard(1, [{ id: 11, numero: "F2", totalTTC: "", dateEcheance: new Date("2026-06-10"), clientNom: null }]);
    await genererRappelsFacturesEnRetard(repo, A, now);
    const [n] = await listNotifications(repo, A);
    expect(n.message).toContain("de Client est en retard");
    expect(n.message).toContain("0.00 €");
  });
});
