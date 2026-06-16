import { describe, it, expect } from "vitest";
import { defaultParametres } from "./parametres";

// Valeurs par défaut du singleton paramètres (renvoyées quand aucune ligne tenant n'existe encore).
// Doivent rester alignées sur les DEFAULT de la table.
describe("defaultParametres", () => {
  it("reprend l'artisanId fourni", () => {
    expect(defaultParametres(42).artisanId).toBe(42);
  });

  it("préfixes de numérotation + compteurs initialisés à 1", () => {
    const p = defaultParametres(1);
    expect(p.prefixeDevis).toBe("DEV");
    expect(p.prefixeFacture).toBe("FAC");
    expect(p.prefixeAvoir).toBe("AV");
    expect(p.compteurDevis).toBe(1);
    expect(p.compteurFacture).toBe(1);
    expect(p.compteurAvoir).toBe(1);
  });

  it("valeurs métier par défaut (paiement / rappels / objectifs / couleurs)", () => {
    const p = defaultParametres(1);
    expect(p.delaiPaiementType).toBe("net");
    expect(p.notificationsEmail).toBe(true);
    expect(p.rappelDevisJours).toBe(7);
    expect(p.rappelFactureJours).toBe(30);
    expect(p.objectifCA).toBe("0");
    expect(p.objectifDevis).toBe(0);
    expect(p.objectifClients).toBe(0);
    expect(p.couleurPrincipale).toBe("#4F46E5");
    expect(p.couleurSecondaire).toBe("#6366F1");
  });

  it("champs optionnels à null par défaut", () => {
    const p = defaultParametres(1);
    expect(p.mentionsLegales).toBeNull();
    expect(p.conditionsGenerales).toBeNull();
    expect(p.conditionsPaiementDefaut).toBeNull();
    expect(p.delaiPaiementJours).toBeNull();
  });

  it("seul l'artisanId varie entre deux tenants (mêmes défauts)", () => {
    expect(defaultParametres(7)).toEqual({ ...defaultParametres(9), artisanId: 7 });
  });
});
