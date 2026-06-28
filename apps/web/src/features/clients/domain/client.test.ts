import { describe, expect, it } from "vitest";
import {
  nomComplet,
  findDuplicateGroups,
  findCreateDuplicateMatch,
  pickSurvivor,
  ofClient,
  activitesOfClient,
  sortActivitesByEcheance,
  computeClientStats,
  type Client,
  type DevisRow,
  type FactureRow,
  type InterventionRow,
  type ActiviteRow,
} from "./client";

// Fabrique de Client minimal pour les tests purs (les champs non utilisés sont remplis loosely).
const mk = (p: Partial<Client> & { id: number }): Client => ({
  nom: "", prenom: "", email: "", telephone: "", ville: "", raisonSociale: null,
  ...p,
} as unknown as Client);

describe("pickSurvivor", () => {
  it("choisit le client au profil le plus complet", () => {
    const pauvre = mk({ id: 1, nom: "Martin" });
    const riche = mk({ id: 2, nom: "Martin", email: "m@a.fr", telephone: "0600000000", ville: "Lyon" });
    expect(pickSurvivor([pauvre, riche]).id).toBe(2);
  });

  it("à profils égaux, garde le plus ancien (id le plus petit)", () => {
    const a = mk({ id: 5, nom: "Martin", email: "m@a.fr" });
    const b = mk({ id: 2, nom: "Martin", email: "m@b.fr" });
    expect(pickSurvivor([a, b]).id).toBe(2);
  });
});

// Règle de domaine PURE (sans réseau) : libellé d'affichage d'un client.
describe("nomComplet", () => {
  it("privilégie la raison sociale si présente", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "Jean", raisonSociale: "ACME SARL" })).toBe("ACME SARL");
  });

  it("compose prénom + nom pour un particulier", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "Jean", raisonSociale: null })).toBe("Jean Dupont");
  });

  it("tolère un prénom absent", () => {
    expect(nomComplet({ nom: "Dupont", prenom: null, raisonSociale: null })).toBe("Dupont");
  });

  it("retombe sur le nom si la composition est vide", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "", raisonSociale: "" })).toBe("Dupont");
  });
});

describe("findDuplicateGroups", () => {
  it("groupe par même email (normalisé)", () => {
    const groups = findDuplicateGroups([
      mk({ id: 1, nom: "A", email: "  X@MAIL.com " }),
      mk({ id: 2, nom: "B", email: "x@mail.com" }),
      mk({ id: 3, nom: "C", email: "autre@mail.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasonKey).toBe("dupesSameEmail");
    expect(groups[0].reasonParams?.email).toBe("x@mail.com");
    expect(groups[0].clients.map((c) => c.id)).toEqual([1, 2]);
  });

  it("groupe par même prénom+nom", () => {
    const groups = findDuplicateGroups([
      mk({ id: 1, nom: "Dupont", prenom: "Jean" }),
      mk({ id: 2, nom: "dupont", prenom: " jean " }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasonKey).toBe("dupesSameName");
  });

  it("ne signale rien sans doublon", () => {
    expect(findDuplicateGroups([mk({ id: 1, nom: "A", email: "a@x.fr" })])).toEqual([]);
  });
});

describe("findCreateDuplicateMatch", () => {
  const base = [mk({ id: 9, nom: "Martin", prenom: "Léa", email: "lea@x.fr", telephone: "0612345678" })];

  it("détecte par email", () => {
    const m = findCreateDuplicateMatch({ email: "LEA@x.fr", telephone: "", prenom: "", nom: "" }, base);
    expect(m?.reasonKey).toBe("dupeReasonEmail");
  });
  it("détecte par téléphone (>= 6 chiffres)", () => {
    const m = findCreateDuplicateMatch({ email: "", telephone: "06 12 34 56 78", prenom: "", nom: "" }, base);
    expect(m?.reasonKey).toBe("dupeReasonPhone");
  });
  it("détecte par nom", () => {
    const m = findCreateDuplicateMatch({ email: "", telephone: "", prenom: "Léa", nom: "Martin" }, base);
    expect(m?.reasonKey).toBe("dupeReasonName");
  });
  it("renvoie null si aucun match", () => {
    expect(findCreateDuplicateMatch({ email: "x@y.fr", telephone: "", prenom: "", nom: "" }, base)).toBeNull();
  });
});

// Fabriques minimales pour les fonctions de la vue détail (champs non testés remplis loosely).
const mkDevis = (p: Partial<DevisRow> & { id: number }): DevisRow =>
  ({ clientId: null, statut: "brouillon", totalTTC: "0", ...p } as unknown as DevisRow);
const mkFacture = (p: Partial<FactureRow> & { id: number }): FactureRow =>
  ({ clientId: null, statut: "brouillon", totalTTC: "0", ...p } as unknown as FactureRow);
const mkInterv = (p: Partial<InterventionRow> & { id: number }): InterventionRow =>
  ({ clientId: null, statut: "planifiee", ...p } as unknown as InterventionRow);
const mkActivite = (p: Partial<ActiviteRow> & { id: number }): ActiviteRow =>
  ({ entiteType: "client", entiteId: 0, fait: false, echeance: "2026-01-01", type: "appel", ...p } as unknown as ActiviteRow);

describe("ofClient", () => {
  it("ne garde que les lignes du client demandé", () => {
    const rows = [mkDevis({ id: 1, clientId: 7 }), mkDevis({ id: 2, clientId: 9 }), mkDevis({ id: 3, clientId: 7 })];
    expect(ofClient(rows, 7).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe("activitesOfClient", () => {
  it("filtre par entiteType=client ET entiteId", () => {
    const rows = [
      mkActivite({ id: 1, entiteId: 5 }),
      mkActivite({ id: 2, entiteId: 5, entiteType: "devis" }),
      mkActivite({ id: 3, entiteId: 8 }),
    ];
    expect(activitesOfClient(rows, 5).map((r) => r.id)).toEqual([1]);
  });
});

describe("sortActivitesByEcheance", () => {
  it("trie par échéance croissante sans muter l'entrée", () => {
    const rows = [
      mkActivite({ id: 1, echeance: "2026-03-01" }),
      mkActivite({ id: 2, echeance: "2026-01-01" }),
      mkActivite({ id: 3, echeance: "2026-02-01" }),
    ];
    expect(sortActivitesByEcheance(rows).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]); // entrée intacte
  });
});

describe("computeClientStats", () => {
  it("agrège payées / impayées / devis envoyés / interventions terminées", () => {
    const devis = [mkDevis({ id: 1, statut: "envoye" }), mkDevis({ id: 2, statut: "brouillon" })];
    const factures = [
      mkFacture({ id: 1, statut: "payee", totalTTC: "100.50" }),
      mkFacture({ id: 2, statut: "envoyee", totalTTC: "40" }),
      mkFacture({ id: 3, statut: "annulee", totalTTC: "999" }),
    ];
    const interventions = [mkInterv({ id: 1, statut: "terminee" }), mkInterv({ id: 2, statut: "planifiee" })];
    const stats = computeClientStats(devis, factures, interventions);
    expect(stats.totalFacture).toBeCloseTo(100.5);
    expect(stats.facturesImpayees).toBeCloseTo(40); // annulée exclue
    expect(stats.devisEnAttente).toBe(1);
    expect(stats.interventionsTerminees).toBe(1);
  });

  it("tolère des montants non numériques (résilience)", () => {
    const factures = [mkFacture({ id: 1, statut: "payee", totalTTC: "abc" as unknown as string })];
    expect(computeClientStats([], factures, []).totalFacture).toBe(0);
  });
});
