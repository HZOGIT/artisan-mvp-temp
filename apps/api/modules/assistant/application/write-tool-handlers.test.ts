import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { AssistantReadToolRegistry } from "./assistant-tool-registry";
import {
  buildAssistantWriteHandlers,
  type ClientWriterForAgent,
  type ClientByIdReaderForAgent,
  type InterventionWriterForAgent,
  type ClientCreateInput,
  type InterventionCreateInput,
  type DevisWriterForAgent,
  type DevisLigneInput,
  type FactureWriterForAgent,
  type FactureLigneInput,
  type DevisSenderForAgent,
  type FactureSenderForAgent,
  type CommandeWriterForAgent,
  type CommandeLigneInput,
  type CommandeSenderForAgent,
  type InterventionUpdaterForAgent,
  type InterventionUpdatePatch,
} from "./write-tool-handlers";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

class FakeClientWriter implements ClientWriterForAgent {
  public calls: { ctx: TenantContext; input: ClientCreateInput }[] = [];
  constructor(private readonly fail = false) {}
  async create(c: TenantContext, input: ClientCreateInput) {
    if (this.fail) throw new Error("DB down");
    this.calls.push({ ctx: c, input });
    return { id: 42, nom: input.nom, prenom: input.prenom ?? null };
  }
}
class FakeClientById implements ClientByIdReaderForAgent {
  constructor(private readonly client: { id: number; nom: string; prenom: string | null; adresse: string | null; codePostal: string | null; ville: string | null } | null) {}
  async getById() {
    return this.client;
  }
}
class FakeInterventionWriter implements InterventionWriterForAgent {
  public calls: { ctx: TenantContext; input: InterventionCreateInput }[] = [];
  async create(c: TenantContext, input: InterventionCreateInput) {
    this.calls.push({ ctx: c, input });
    return { id: 7, titre: input.titre, dateDebut: input.dateDebut, dateFin: input.dateFin };
  }
}

describe("write-tool-handlers — creer_client", () => {
  it("sans nom → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ clients: new FakeClientWriter() });
    expect((await h.creer_client({}, ctx)).ok).toBe(false);
  });

  it("succès → clientId + message ; `type` archivé en notes", async () => {
    const writer = new FakeClientWriter();
    const h = buildAssistantWriteHandlers({ clients: writer });
    const res = await h.creer_client({ nom: "Dupont", prenom: "Jean", type: "professionnel" }, ctx);
    expect(res).toEqual({ ok: true, data: { clientId: 42, nom: "Dupont", message: "Client Jean Dupont créé (ID 42)" } });
    expect(writer.calls[0].input.notes).toBe("Type : professionnel");
    expect(writer.calls[0].ctx.artisanId).toBe(1);
  });

  it("exception du writer → ok:false avec message (parité try/catch)", async () => {
    const h = buildAssistantWriteHandlers({ clients: new FakeClientWriter(true) });
    const res = await h.creer_client({ nom: "X" }, ctx);
    expect(res).toEqual({ ok: false, error: "DB down" });
  });
});

describe("write-tool-handlers — creer_intervention", () => {
  const client = { id: 3, nom: "DAD", prenom: "Michel", adresse: "1 rue A", codePostal: "75000", ville: "Paris" };

  it("champs manquants → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ clientsById: new FakeClientById(client), interventions: new FakeInterventionWriter() });
    expect((await h.creer_intervention({ clientId: 3, titre: "Pose" }, ctx)).ok).toBe(false);
  });

  it("client d'un autre tenant (getById null) → ok:false (anti-IDOR)", async () => {
    const h = buildAssistantWriteHandlers({ clientsById: new FakeClientById(null), interventions: new FakeInterventionWriter() });
    const res = await h.creer_intervention({ clientId: 99, titre: "Pose", dateDebut: "2026-07-01T08:00:00", dateFin: "2026-07-01T10:00:00" }, ctx);
    expect(res).toEqual({ ok: false, error: "Client introuvable" });
  });

  it("succès : statut planifiee forcé + adresse par défaut = adresse client + message", async () => {
    const writer = new FakeInterventionWriter();
    const h = buildAssistantWriteHandlers({ clientsById: new FakeClientById(client), interventions: writer });
    const res = await h.creer_intervention({ clientId: 3, titre: "Réparation fuite", dateDebut: "2026-07-01T08:00:00", dateFin: "2026-07-01T10:00:00" }, ctx);
    expect(res.ok).toBe(true);
    expect(writer.calls[0].input.statut).toBe("planifiee");
    expect(writer.calls[0].input.adresse).toBe("1 rue A 75000 Paris"); // recomposée depuis le client
    if (res.ok) {
      const data = res.data as { interventionId: number; client: string; message: string };
      expect(data.interventionId).toBe(7);
      expect(data.client).toBe("Michel DAD");
      expect(data.message).toContain("planifiée pour Michel DAD");
    }
  });

  it("date invalide → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ clientsById: new FakeClientById(client), interventions: new FakeInterventionWriter() });
    const res = await h.creer_intervention({ clientId: 3, titre: "Pose", dateDebut: "pas-une-date", dateFin: "2026-07-01T10:00:00" }, ctx);
    expect(res).toEqual({ ok: false, error: "Format de date invalide (utiliser ISO 8601)" });
  });
});

class FakeDevisWriter implements DevisWriterForAgent {
  public lignes: DevisLigneInput[] = [];
  public created?: { clientId: number; objet: string; notes?: string; dateValidite: Date };
  constructor(private readonly ownsClient = true) {}
  async creer(_c: TenantContext, input: { clientId: number; objet: string; notes?: string; dateValidite: Date }) {
    if (!this.ownsClient) throw new Error("Client introuvable");
    this.created = input;
    return { id: 55 };
  }
  async ajouterLigne(_c: TenantContext, _devisId: number, ligne: DevisLigneInput) {
    this.lignes.push(ligne);
  }
  async getById() {
    return { numero: "DEV-2026-0001", totalTTC: "240.00", statut: "brouillon" };
  }
}

describe("write-tool-handlers — creer_devis", () => {
  it("paramètres manquants (pas de ligne) → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ devis: new FakeDevisWriter() });
    expect((await h.creer_devis({ clientId: 1, objet: "Travaux", lignes: [] }, ctx)).ok).toBe(false);
  });

  it("succès : brouillon + lignes (défauts unite=u, tva=20) + message TTC", async () => {
    const writer = new FakeDevisWriter();
    const h = buildAssistantWriteHandlers({ devis: writer });
    const res = await h.creer_devis(
      { clientId: 3, objet: "Réfection", lignes: [{ designation: "Main d'œuvre", quantite: 2, prixUnitaireHT: 50 }] },
      ctx,
    );
    expect(res).toMatchObject({ ok: true, data: { devisId: 55, numero: "DEV-2026-0001", statut: "brouillon" } });
    if (res.ok) expect((res.data as { message: string }).message).toBe("Devis DEV-2026-0001 créé en brouillon (240.00 € TTC)");
    expect(writer.lignes[0]).toEqual({ designation: "Main d'œuvre", quantite: "2", unite: "u", prixUnitaireHT: "50", tauxTVA: "20", tvaCategorieId: "FR_20" });
  });

  it("client d'un autre tenant → ok:false (le use-case migré lève, capté)", async () => {
    const h = buildAssistantWriteHandlers({ devis: new FakeDevisWriter(false) });
    const res = await h.creer_devis({ clientId: 99, objet: "X", lignes: [{ designation: "A", quantite: 1, prixUnitaireHT: 10 }] }, ctx);
    expect(res).toEqual({ ok: false, error: "Client introuvable" });
  });
});

class FakeFactureWriter implements FactureWriterForAgent {
  public lignes: FactureLigneInput[] = [];
  public converted?: number;
  public objetSet?: string;
  constructor(private readonly opts: { convertThrows?: string; objet?: string | null } = {}) {}
  async creer(_c: TenantContext, _input: { clientId: number; objet: string; dateEcheance: Date }) {
    return { id: 88 };
  }
  async ajouterLigne(_c: TenantContext, _factureId: number, ligne: FactureLigneInput) {
    this.lignes.push(ligne);
  }
  async convertirDevis(_c: TenantContext, devisId: number) {
    if (this.opts.convertThrows) throw new Error(this.opts.convertThrows);
    this.converted = devisId;
    return { id: 88 };
  }
  async setObjet(_c: TenantContext, _factureId: number, objet: string) {
    this.objetSet = objet;
  }
  async getById() {
    return { numero: "FAC-2026-0001", totalTTC: "360.00", statut: "brouillon", objet: this.opts.objet ?? "Objet devis" };
  }
}

describe("write-tool-handlers — creer_facture", () => {
  it("objet manquant → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ factures: new FakeFactureWriter() });
    expect((await h.creer_facture({ clientId: 1, lignes: [{ designation: "A", quantite: 1, prixUnitaireHT: 10 }] }, ctx)).ok).toBe(false);
  });

  it("mode lignes : crée + lignes (défauts) + message TTC", async () => {
    const writer = new FakeFactureWriter();
    const h = buildAssistantWriteHandlers({ factures: writer });
    const res = await h.creer_facture({ clientId: 3, objet: "Travaux", lignes: [{ designation: "Pose", quantite: 3, prixUnitaireHT: 100 }] }, ctx);
    expect(res).toMatchObject({ ok: true, data: { factureId: 88, numero: "FAC-2026-0001", statut: "brouillon" } });
    expect(writer.lignes[0]).toEqual({ designation: "Pose", quantite: "3", unite: "u", prixUnitaireHT: "100", tauxTVA: "20", tvaCategorieId: "FR_20" });
    if (res.ok) expect((res.data as { message: string }).message).toBe("Facture FAC-2026-0001 créée (360.00 € TTC)");
  });

  it("mode lignes sans clientId → ok:false ; sans ligne → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ factures: new FakeFactureWriter() });
    expect((await h.creer_facture({ objet: "X", lignes: [{ designation: "A", quantite: 1, prixUnitaireHT: 1 }] }, ctx)).ok).toBe(false);
    expect((await h.creer_facture({ objet: "X", clientId: 3, lignes: [] }, ctx)).ok).toBe(false);
  });

  it("mode devis : convertit + override objet si différent", async () => {
    const writer = new FakeFactureWriter({ objet: "Ancien objet" });
    const h = buildAssistantWriteHandlers({ factures: writer });
    const res = await h.creer_facture({ devisId: 12, objet: "Nouvel objet" }, ctx);
    expect(res.ok).toBe(true);
    expect(writer.converted).toBe(12);
    expect(writer.objetSet).toBe("Nouvel objet");
  });

  it("mode devis : devis non accepté/cross-tenant (use-case lève) → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ factures: new FakeFactureWriter({ convertThrows: "Seul un devis accepté peut être converti en facture" }) });
    const res = await h.creer_facture({ devisId: 12, objet: "X" }, ctx);
    expect(res).toEqual({ ok: false, error: "Seul un devis accepté peut être converti en facture" });
  });
});

describe("write-tool-handlers — envoyer_devis / envoyer_facture", () => {
  it("envoyer_devis sans devisId → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ devisSender: { envoyer: async () => ({ success: true, message: "x" }) } });
    expect((await h.envoyer_devis({}, ctx)).ok).toBe(false);
  });

  it("envoyer_devis succès → ok + message ; passe le customMessage", async () => {
    let seen: { id: number; msg?: string } | undefined;
    const sender: DevisSenderForAgent = {
      envoyer: async (_c, id, msg) => {
        seen = { id, msg };
        return { success: true, message: `Devis DEV-1 envoyé à c@x.fr` };
      },
    };
    const h = buildAssistantWriteHandlers({ devisSender: sender });
    const res = await h.envoyer_devis({ devisId: 5, messagePersonnalise: "Bonjour" }, ctx);
    expect(res).toEqual({ ok: true, data: { message: "Devis DEV-1 envoyé à c@x.fr" } });
    expect(seen).toEqual({ id: 5, msg: "Bonjour" });
  });

  it("envoyer_devis : exception du use-case (ownership/email) → ok:false", async () => {
    const sender: DevisSenderForAgent = {
      envoyer: async () => {
        throw new Error("Le client n'a pas d'adresse email");
      },
    };
    const h = buildAssistantWriteHandlers({ devisSender: sender });
    expect(await h.envoyer_devis({ devisId: 5 }, ctx)).toEqual({ ok: false, error: "Le client n'a pas d'adresse email" });
  });

  it("envoyer_facture succès → ok + message", async () => {
    const sender: FactureSenderForAgent = { envoyer: async () => ({ success: true, message: "Facture FAC-1 envoyé(e) à c@x.fr" }) };
    const h = buildAssistantWriteHandlers({ factureSender: sender });
    const res = await h.envoyer_facture({ factureId: 9 }, ctx);
    expect(res).toEqual({ ok: true, data: { message: "Facture FAC-1 envoyé(e) à c@x.fr" } });
  });

  it("envoyer_relance : sans factureId → ok:false ; succès → message", async () => {
    let seen: number | undefined;
    const sender = {
      envoyer: async (_c: TenantContext, id: number) => {
        seen = id;
        return { success: true, message: "Relance envoyée à c@x.fr — facture FAC-1, 12 j de retard" };
      },
    };
    const h = buildAssistantWriteHandlers({ relanceSender: sender });
    expect((await h.envoyer_relance({}, ctx)).ok).toBe(false);
    const res = await h.envoyer_relance({ factureId: 9 }, ctx);
    expect(res).toEqual({ ok: true, data: { message: "Relance envoyée à c@x.fr — facture FAC-1, 12 j de retard" } });
    expect(seen).toBe(9);
  });
});

describe("write-tool-handlers — creer_et_envoyer_devis", () => {
  it("crée puis envoie → message combiné", async () => {
    const writer = new FakeDevisWriter();
    const sender: DevisSenderForAgent = { envoyer: async () => ({ success: true, message: "Devis DEV-2026-0001 envoyé à c@x.fr" }) };
    const h = buildAssistantWriteHandlers({ devis: writer, devisSender: sender });
    const res = await h.creer_et_envoyer_devis({ clientId: 3, objet: "Réfection", lignes: [{ designation: "MO", quantite: 1, prixUnitaireHT: 100 }] }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as { message: string }).message).toContain("créé et envoyé");
  });

  it("création OK mais envoi KO → ok:false (devis conservé)", async () => {
    const sender: DevisSenderForAgent = { envoyer: async () => ({ success: false, message: "client sans email" }) };
    const h = buildAssistantWriteHandlers({ devis: new FakeDevisWriter(), devisSender: sender });
    const res = await h.creer_et_envoyer_devis({ clientId: 3, objet: "X", lignes: [{ designation: "A", quantite: 1, prixUnitaireHT: 10 }] }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("créé mais email non envoyé");
  });

  it("params manquants → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ devis: new FakeDevisWriter(), devisSender: { envoyer: async () => ({ success: true, message: "" }) } });
    expect((await h.creer_et_envoyer_devis({ clientId: 3, objet: "X", lignes: [] }, ctx)).ok).toBe(false);
  });
});

class FakeCommandeWriter implements CommandeWriterForAgent {
  public input?: { fournisseurId: number; notes?: string; lignes: readonly CommandeLigneInput[] };
  async creer(_c: TenantContext, input: { fournisseurId: number; notes?: string; lignes: readonly CommandeLigneInput[] }) {
    this.input = input;
    return { id: 31, numero: "BC-2026-0001", totalTTC: "600.00" };
  }
}

describe("write-tool-handlers — commandes fournisseurs", () => {
  it("creer_commande_fournisseur : sans fournisseur/ligne → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ commandes: new FakeCommandeWriter() });
    expect((await h.creer_commande_fournisseur({ lignes: [{ designation: "A", quantite: 1 }] }, ctx)).ok).toBe(false);
    expect((await h.creer_commande_fournisseur({ fournisseurId: 2, lignes: [] }, ctx)).ok).toBe(false);
  });

  it("creer_commande_fournisseur : prixUnitaireHT→prixUnitaire, delai→notes, message TTC", async () => {
    const writer = new FakeCommandeWriter();
    const h = buildAssistantWriteHandlers({ commandes: writer });
    const res = await h.creer_commande_fournisseur(
      { fournisseurId: 2, notes: "Urgent", delaiLivraison: "2 semaines", lignes: [{ designation: "Tube", quantite: 6, prixUnitaireHT: 50 }] },
      ctx,
    );
    expect(res).toMatchObject({ ok: true, data: { commandeId: 31, numero: "BC-2026-0001" } });
    expect(writer.input?.notes).toBe("Urgent — Délai : 2 semaines");
    expect(writer.input?.lignes[0]).toEqual({ designation: "Tube", quantite: "6", unite: "u", prixUnitaire: "50", tauxTVA: "20", tvaCategorieId: "FR_20" });
  });

  it("envoyer_commande_fournisseur : sans id → ok:false ; succès → message", async () => {
    const sender: CommandeSenderForAgent = { envoyer: async () => ({ success: true, message: "Bon de commande BC-2026-0001 envoyé à f@x.fr" }) };
    const h = buildAssistantWriteHandlers({ commandeSender: sender });
    expect((await h.envoyer_commande_fournisseur({}, ctx)).ok).toBe(false);
    const res = await h.envoyer_commande_fournisseur({ commandeId: 31 }, ctx);
    expect(res).toEqual({ ok: true, data: { message: "Bon de commande BC-2026-0001 envoyé à f@x.fr" } });
  });
});

class FakeInterventionUpdater implements InterventionUpdaterForAgent {
  public patch?: InterventionUpdatePatch;
  public id?: number;
  constructor(private readonly fail?: string) {}
  async modifier(_c: TenantContext, id: number, patch: InterventionUpdatePatch) {
    if (this.fail) throw new Error(this.fail);
    this.id = id;
    this.patch = patch;
    return { id, titre: patch.titre ?? "Pose", statut: patch.statut ?? "planifiee" };
  }
}

describe("write-tool-handlers — modifier_intervention", () => {
  it("sans interventionId → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ interventionUpdater: new FakeInterventionUpdater() });
    expect((await h.modifier_intervention({}, ctx)).ok).toBe(false);
  });

  it("aucun champ → ok:false 'Aucun champ à modifier'", async () => {
    const h = buildAssistantWriteHandlers({ interventionUpdater: new FakeInterventionUpdater() });
    expect(await h.modifier_intervention({ interventionId: 7 }, ctx)).toEqual({ ok: false, error: "Aucun champ à modifier" });
  });

  it("date invalide → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ interventionUpdater: new FakeInterventionUpdater() });
    expect((await h.modifier_intervention({ interventionId: 7, dateDebut: "pas-une-date" }, ctx)).ok).toBe(false);
  });

  it("succès : patch partiel (titre + statut) + message", async () => {
    const updater = new FakeInterventionUpdater();
    const h = buildAssistantWriteHandlers({ interventionUpdater: updater });
    const res = await h.modifier_intervention({ interventionId: 7, titre: "Réparation", statut: "terminee" }, ctx);
    expect(res).toMatchObject({ ok: true, data: { interventionId: 7, message: "Intervention #7 mise à jour" } });
    expect(updater.patch).toEqual({ titre: "Réparation", statut: "terminee" });
  });

  it("intervention d'un autre tenant (use-case lève) → ok:false", async () => {
    const h = buildAssistantWriteHandlers({ interventionUpdater: new FakeInterventionUpdater("Intervention introuvable") });
    expect(await h.modifier_intervention({ interventionId: 99, titre: "X" }, ctx)).toEqual({ ok: false, error: "Intervention introuvable" });
  });
});

describe("write-tool-handlers — intégration registry (opt-in)", () => {
  const writeHandlers = buildAssistantWriteHandlers({
    clients: new FakeClientWriter(),
    clientsById: new FakeClientById({ id: 3, nom: "DAD", prenom: "Michel", adresse: null, codePostal: null, ville: null }),
    interventions: new FakeInterventionWriter(),
  });

  it("écritures câblées → exposées dans tools + exécutables", async () => {
    const reg = new AssistantReadToolRegistry({}, writeHandlers);
    expect(reg.tools.map((t) => t.name).sort()).toEqual(["creer_client", "creer_intervention", "naviguer_vers"].sort());
    expect((await reg.execute("creer_client", { nom: "Y" }, ctx)).ok).toBe(true);
  });

  it("sans writeHandlers → écritures refusées + absentes de tools (défaut sûr préservé)", async () => {
    const reg = new AssistantReadToolRegistry({});
    expect(reg.tools.some((t) => t.name === "creer_client")).toBe(false);
    expect((await reg.execute("creer_client", { nom: "Y" }, ctx)).ok).toBe(false);
  });

  it("toutes deps fournies → les 11 écritures sont câblées (registry agentique complet)", () => {
    const okSend = { envoyer: async () => ({ success: true, message: "ok" }) };
    const all = buildAssistantWriteHandlers({
      clients: new FakeClientWriter(),
      clientsById: new FakeClientById({ id: 3, nom: "DAD", prenom: "M", adresse: null, codePostal: null, ville: null }),
      interventions: new FakeInterventionWriter(),
      interventionUpdater: new FakeInterventionUpdater(),
      devis: new FakeDevisWriter(),
      factures: new FakeFactureWriter(),
      devisSender: { envoyer: async () => ({ success: true, message: "ok" }) },
      factureSender: okSend,
      relanceSender: okSend,
      commandes: new FakeCommandeWriter(),
      commandeSender: okSend,
    });
    expect(Object.keys(all).sort()).toEqual(
      [
        "creer_client",
        "creer_intervention",
        "modifier_intervention",
        "creer_devis",
        "creer_et_envoyer_devis",
        "creer_facture",
        "envoyer_devis",
        "envoyer_facture",
        "envoyer_relance",
        "creer_commande_fournisseur",
        "envoyer_commande_fournisseur",
      ].sort(),
    );
    expect(Object.keys(all)).toHaveLength(11);
  });
});
