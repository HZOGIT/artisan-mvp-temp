import { describe, it, expect } from "vitest";
import { ConflictError, NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { VitrinePublicReaderFake } from "../infra/vitrine-public-reader-fake";
import { getBySlug, submitContact, getDemandesContact, updateDemandeContactStatut, convertirDemandeEnClient, type SubmitContactDeps, type LeadsAdminDeps } from "./use-cases";

const ARTISAN = { id: 7, nomEntreprise: "ACME", specialite: "plomberie", telephone: "0102", email: "pro@acme.fr", ville: "Paris", codePostal: "75001", adresse: "1 rue A", siret: "123", logo: null };

function reader(over: Partial<ConstructorParameters<typeof VitrinePublicReaderFake>[0]> = {}) {
  return new VitrinePublicReaderFake({
    artisansBySlug: { "acme": ARTISAN },
    params: { 7: { vitrineActive: true, vitrineDescription: "Desc", vitrineZone: "IDF", vitrineServices: '["Plomberie"]', vitrineExperience: 10 } },
    avis: { 7: [{ id: 1, note: 5, commentaire: "Top", reponseArtisan: null, reponseAt: null, createdAt: new Date("2026-06-01"), clientNom: "Jean D" }] },
    publicStats: { 7: { totalClients: 12, totalInterventions: 34 } },
    categories: { 7: ["Chauffage"] },
    ...over,
  });
}

describe("getBySlug", () => {
  it("vitrine active → payload agrégé (artisan + vitrine + avis + stats)", async () => {
    const res = (await getBySlug(reader(), "acme")) as any;
    expect(res.artisan.nomEntreprise).toBe("ACME");
    expect(res.vitrine.services).toEqual(["Plomberie"]); // JSON prioritaire
    expect(res.avis).toHaveLength(1);
    expect(res.avisStats.moyenne).toBe(5);
    expect(res.publicStats.totalClients).toBe(12);
  });
  it("slug inconnu → NotFound", async () => {
    await expect(getBySlug(reader({ artisansBySlug: {} }), "x")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("vitrine inactive → NotFound", async () => {
    await expect(getBySlug(reader({ params: { 7: { vitrineActive: false, vitrineDescription: null, vitrineZone: null, vitrineServices: null, vitrineExperience: null } } }), "acme")).rejects.toBeInstanceOf(NotFoundError);
  });
});

function submitDeps(over: Partial<SubmitContactDeps> = {}): { deps: SubmitContactDeps; sent: any[]; leadsCreated: any[]; notifs: any[] } {
  const sent: any[] = [];
  const leadsCreated: any[] = [];
  const notifs: any[] = [];
  const deps: SubmitContactDeps = {
    reader: reader(),
    rateLimiter: { check: async () => true },
    email: { send: async (m) => { sent.push(m); } },
    notifications: { creer: async (_c, i) => { notifs.push(i); return {}; } },
    leads: { list: async () => [], getById: async () => null, setStatut: async () => ({}), create: async (_c, i) => { leadsCreated.push(i); return {}; } },
    ...over,
  };
  return { deps, sent, leadsCreated, notifs };
}

const INPUT = { slug: "acme", nom: "Bob", email: "bob@x.fr", message: "Bonjour je voudrais un devis." };

describe("submitContact", () => {
  it("succès → email artisan + notif + lead persisté", async () => {
    const { deps, sent, leadsCreated, notifs } = submitDeps();
    expect(await submitContact(deps, INPUT, "1.2.3.4")).toEqual({ success: true });
    expect(sent[0].to).toBe("pro@acme.fr");
    expect(sent[0].body).toContain("bob@x.fr");
    expect(notifs[0].titre).toBe("Nouveau contact vitrine");
    expect(leadsCreated[0]).toMatchObject({ nom: "Bob", source: "vitrine" });
  });
  it("artisan inconnu → NotFound (pas d'email)", async () => {
    const { deps, sent } = submitDeps({ reader: reader({ artisansBySlug: {} }) });
    await expect(submitContact(deps, INPUT, "ip")).rejects.toBeInstanceOf(NotFoundError);
    expect(sent).toHaveLength(0);
  });
  it("vitrine inactive → NotFound", async () => {
    const { deps } = submitDeps({ reader: reader({ params: { 7: { vitrineActive: false, vitrineDescription: null, vitrineZone: null, vitrineServices: null, vitrineExperience: null } } }) });
    await expect(submitContact(deps, INPUT, "ip")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("rate-limit atteint → TooManyRequests (pas d'email)", async () => {
    const { deps, sent } = submitDeps({ rateLimiter: { check: async () => false } });
    await expect(submitContact(deps, INPUT, "ip")).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(sent).toHaveLength(0);
  });
  it("email envoyé même si notif/lead échouent (best-effort)", async () => {
    const { deps, sent } = submitDeps({ notifications: { creer: async () => { throw new Error("x"); } }, leads: { list: async () => [], getById: async () => null, setStatut: async () => ({}), create: async () => { throw new Error("y"); } } });
    expect(await submitContact(deps, INPUT, "ip")).toEqual({ success: true });
    expect(sent).toHaveLength(1);
  });
});

const ctx: TenantContext = { artisanId: 7, userId: 1 };

describe("leads admin", () => {
  function adminDeps(over: Partial<LeadsAdminDeps> = {}): { deps: LeadsAdminDeps; statutCalls: any[]; created: any[] } {
    const statutCalls: any[] = [];
    const created: any[] = [];
    const deps: LeadsAdminDeps = {
      leads: {
        list: async () => [{ id: 1 }, { id: 2 }],
        getById: async (_c, id) => (id === 9 ? { id: 9, clientId: null, nom: "Lead Z", email: "z@x.fr", telephone: "06" } : id === 8 ? { id: 8, clientId: 55, nom: "Déjà", email: null, telephone: null } : null),
        setStatut: async (_c, id, statut, clientId) => { statutCalls.push({ id, statut, clientId }); return {}; },
        create: async () => ({}),
      },
      clients: { create: async (_c, i) => { created.push(i); return { id: 77 }; } },
      ...over,
    };
    return { deps, statutCalls, created };
  }

  it("getDemandesContact → liste", async () => {
    const { deps } = adminDeps();
    expect(await getDemandesContact(deps, ctx)).toHaveLength(2);
  });
  it("updateDemandeContactStatut : ownership + set direct", async () => {
    const { deps, statutCalls } = adminDeps();
    expect(await updateDemandeContactStatut(deps, ctx, 9, "contacte")).toEqual({ success: true });
    expect(statutCalls).toEqual([{ id: 9, statut: "contacte", clientId: undefined }]);
  });
  it("updateDemandeContactStatut : lead hors tenant → NotFound", async () => {
    const { deps } = adminDeps();
    await expect(updateDemandeContactStatut(deps, ctx, 999, "perdu")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("convertirDemandeEnClient : crée le client + lie + converti", async () => {
    const { deps, statutCalls, created } = adminDeps();
    expect(await convertirDemandeEnClient(deps, ctx, 9)).toEqual({ success: true, clientId: 77 });
    expect(created[0]).toMatchObject({ nom: "Lead Z", email: "z@x.fr" });
    expect(statutCalls).toEqual([{ id: 9, statut: "converti", clientId: 77 }]);
  });
  it("convertirDemandeEnClient : déjà convertie → Conflict", async () => {
    const { deps } = adminDeps();
    await expect(convertirDemandeEnClient(deps, ctx, 8)).rejects.toBeInstanceOf(ConflictError);
  });
});
