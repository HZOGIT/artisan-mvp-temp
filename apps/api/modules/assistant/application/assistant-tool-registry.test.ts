import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { AssistantReadToolRegistry, type ReadToolHandler } from "./assistant-tool-registry";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

describe("AssistantReadToolRegistry", () => {
  it("naviguer_vers (pur) câblé par défaut + exposé dans tools", () => {
    const reg = new AssistantReadToolRegistry();
    expect(reg.tools.map((t) => t.name)).toEqual(["naviguer_vers"]);
  });

  it("naviguer_vers : page valide → ok {navigate, confirmation}", async () => {
    const reg = new AssistantReadToolRegistry();
    const res = await reg.execute("naviguer_vers", { page: "/devis/12" }, ctx);
    expect(res).toEqual({ ok: true, data: { navigate: { page: "/devis/12", filtre: undefined, message: undefined }, confirmation: "Page /devis/12 ouverte" } });
  });

  it("naviguer_vers : page invalide → ok:false avec erreur", async () => {
    const reg = new AssistantReadToolRegistry();
    const res = await reg.execute("naviguer_vers", { page: "/pirate" }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Page invalide");
  });

  it("écriture (creer_client) → refusée (activée en Phase 2)", async () => {
    const reg = new AssistantReadToolRegistry();
    const res = await reg.execute("creer_client", { nom: "X" }, ctx);
    expect(res).toEqual({ ok: false, error: "Action non disponible (écriture désactivée pour l'instant)" });
  });

  it("lecture NON câblée (lister_factures) → indisponible + absente de tools", async () => {
    const reg = new AssistantReadToolRegistry();
    expect(reg.tools.some((t) => t.name === "lister_factures")).toBe(false);
    const res = await reg.execute("lister_factures", {}, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("indisponible");
  });

  it("outil inconnu → indisponible", async () => {
    const reg = new AssistantReadToolRegistry();
    const res = await reg.execute("outil_bidon", {}, ctx);
    expect(res.ok).toBe(false);
  });

  it("injection d'une lecture : câblée → exposée dans tools + exécutée sous le bon tenant", async () => {
    const seen: number[] = [];
    const listerFactures: ReadToolHandler = async (_args, c) => {
      seen.push(c.artisanId);
      return { ok: true, data: { count: 0, factures: [] } };
    };
    const reg = new AssistantReadToolRegistry({ lister_factures: listerFactures });
    expect(reg.tools.map((t) => t.name).sort()).toEqual(["lister_factures", "naviguer_vers"]);
    const res = await reg.execute("lister_factures", {}, { artisanId: 9, userId: 1 });
    expect(res).toEqual({ ok: true, data: { count: 0, factures: [] } });
    expect(seen).toEqual([9]);
  });

  it("une écriture injectée par erreur reste refusée (garde-fou Phase 1b)", async () => {
    const reg = new AssistantReadToolRegistry({ creer_facture: async () => ({ ok: true, data: {} }) });
    // creer_facture est une écriture → jamais exposée, jamais exécutée.
    expect(reg.tools.some((t) => t.name === "creer_facture")).toBe(false);
    const res = await reg.execute("creer_facture", {}, ctx);
    expect(res.ok).toBe(false);
  });
});
