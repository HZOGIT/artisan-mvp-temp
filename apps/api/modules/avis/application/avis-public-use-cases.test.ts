import { describe, it, expect } from "vitest";
import { getInfoDemandeAvis, soumettreAvisPublic, type AvisPublicDeps, type SoumettreAvisData } from "./avis-public-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { DemandeAvisPublic } from "./public-demande-reader";

const NOW = new Date("2026-06-14T00:00:00Z");
const FUTURE = new Date("2026-06-28T00:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");

function makeDeps(
  demande: DemandeAvisPublic | null,
  capture?: { soumissions: SoumettreAvisData[] },
): AvisPublicDeps {
  return {
    reader: { getByToken: async () => demande },
    contextReader: {
      getContext: async () => ({ artisanNomEntreprise: "ACME", clientNom: "Marie Durand", interventionTitre: "Réparation fuite", interventionDateDebut: PAST }),
    },
    writer: { soumettre: async (_ctx, data) => { capture?.soumissions.push(data); } },
    maintenant: () => NOW,
    genererToken: () => "tok-avis-fixe",
  };
}

const demande = (over: Partial<DemandeAvisPublic> = {}): DemandeAvisPublic => ({
  id: 7,
  artisanId: 3,
  clientId: 100,
  interventionId: 50,
  statut: "envoyee",
  expiresAt: FUTURE,
  ...over,
});

describe("getInfoDemandeAvis", () => {
  it("token valide → demande + noms artisan/client/intervention + flags", async () => {
    const info = await getInfoDemandeAvis(makeDeps(demande()), "tok");
    expect(info.artisan?.nomEntreprise).toBe("ACME");
    expect(info.client?.nom).toBe("Marie Durand");
    expect(info.intervention?.titre).toBe("Réparation fuite");
    expect(info.isExpired).toBe(false);
    expect(info.isCompleted).toBe(false);
  });

  it("token inconnu → NotFound uniforme (anti-oracle)", async () => {
    await expect(getInfoDemandeAvis(makeDeps(null), "inconnu")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("demande expirée / complétée → flags isExpired / isCompleted", async () => {
    const exp = await getInfoDemandeAvis(makeDeps(demande({ expiresAt: PAST })), "tok");
    expect(exp.isExpired).toBe(true);
    const done = await getInfoDemandeAvis(makeDeps(demande({ statut: "completee" })), "tok");
    expect(done.isCompleted).toBe(true);
  });
});

describe("soumettreAvisPublic", () => {
  it("soumet l'avis (publie) + token avis généré ; renvoie success", async () => {
    const cap = { soumissions: [] as SoumettreAvisData[] };
    const res = await soumettreAvisPublic(makeDeps(demande(), cap), { token: "tok", note: 5, commentaire: "Parfait" });
    expect(res.success).toBe(true);
    expect(cap.soumissions).toHaveLength(1);
    expect(cap.soumissions[0].note).toBe(5);
    expect(cap.soumissions[0].commentaire).toBe("Parfait");
    expect(cap.soumissions[0].tokenAvis).toBe("tok-avis-fixe");
    expect(cap.soumissions[0].demandeId).toBe(7);
  });

  it("déjà complétée → 400 (Validation), aucune écriture", async () => {
    const cap = { soumissions: [] as SoumettreAvisData[] };
    await expect(soumettreAvisPublic(makeDeps(demande({ statut: "completee" }), cap), { token: "tok", note: 4 })).rejects.toBeInstanceOf(ValidationError);
    expect(cap.soumissions).toHaveLength(0);
  });

  it("lien expiré → 400", async () => {
    await expect(soumettreAvisPublic(makeDeps(demande({ expiresAt: PAST })), { token: "tok", note: 4 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("token inconnu → 404 uniforme", async () => {
    await expect(soumettreAvisPublic(makeDeps(null), { token: "x", note: 3 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
