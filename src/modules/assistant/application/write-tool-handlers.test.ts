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
    expect(writer.lignes[0]).toEqual({ designation: "Main d'œuvre", quantite: "2", unite: "u", prixUnitaireHT: "50", tauxTVA: "20" });
  });

  it("client d'un autre tenant → ok:false (le use-case migré lève, capté)", async () => {
    const h = buildAssistantWriteHandlers({ devis: new FakeDevisWriter(false) });
    const res = await h.creer_devis({ clientId: 99, objet: "X", lignes: [{ designation: "A", quantite: 1, prixUnitaireHT: 10 }] }, ctx);
    expect(res).toEqual({ ok: false, error: "Client introuvable" });
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
});
