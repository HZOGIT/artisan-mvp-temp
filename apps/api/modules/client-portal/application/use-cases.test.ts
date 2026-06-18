import { describe, it, expect } from "vitest";
import { NotFoundError, UnauthorizedError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { PortalAccessRepositoryFake } from "../infra/portal-access-repository-fake";
import type { ArtisanPortalInfo, ClientPortalInfo } from "../domain/portal-access";
import { generateAccess, getStatus, deactivate, verifyAccess, getClientInfo, type ClientPortalAdminDeps } from "./use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 9 };
const NOW = new Date("2026-06-15T10:00:00Z");

const CLIENT: ClientPortalInfo = { id: 5, nom: "Dupont", prenom: "Jean", email: "jean@x.fr", telephone: "06", adresse: "1 rue A", codePostal: "75000", ville: "Paris" };
const ARTISAN: ArtisanPortalInfo = { id: 1, nomEntreprise: "ACME", telephone: "01", email: "pro@acme.fr", adresse: "2 rue B", codePostal: "75001", ville: "Paris", siret: "123", logo: null };

function adminDeps(over: Partial<ClientPortalAdminDeps> = {}, access = new PortalAccessRepositoryFake({ clients: { 5: CLIENT }, artisans: { 1: ARTISAN } })): { deps: ClientPortalAdminDeps; sent: any[]; access: PortalAccessRepositoryFake } {
  const sent: any[] = [];
  const deps: ClientPortalAdminDeps = {
    access,
    clients: { getById: async (_c, id) => (id === 5 ? { id: 5, nom: "Dupont", prenom: "Jean", email: "jean@x.fr" } : id === 6 ? { id: 6, nom: "Sans", prenom: null, email: null } : null) },
    email: { send: async (m) => { sent.push(m); } },
    rateLimiter: { check: async () => true },
    genToken: () => "tok-fixed",
    ...over,
  };
  return { deps, sent, access };
}

describe("generateAccess", () => {
  it("succès → crée l'accès + email + renvoie url/token", async () => {
    const { deps, sent, access } = adminDeps();
    const res = await generateAccess(deps, ctx, 5, "https://app.fr", NOW);
    expect(res).toEqual({ url: "https://app.fr/portail/tok-fixed", token: "tok-fixed" });
    expect(sent[0].to).toBe("jean@x.fr");
    expect(sent[0].body).toContain("https://app.fr/portail/tok-fixed");
    expect(access.accesses).toHaveLength(1);
    expect(access.accesses[0].isActive).toBe(true);
  });

  it("client hors tenant → NotFound (anti-IDOR, pas d'email)", async () => {
    const { deps, sent } = adminDeps();
    await expect(generateAccess(deps, ctx, 999, "https://app.fr", NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(sent).toHaveLength(0);
  });

  it("client sans email → ValidationError", async () => {
    const { deps } = adminDeps();
    await expect(generateAccess(deps, ctx, 6, "https://app.fr", NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limit atteint → TooManyRequests", async () => {
    const { deps } = adminDeps({ rateLimiter: { check: async () => false } });
    await expect(generateAccess(deps, ctx, 5, "https://app.fr", NOW)).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("régénérer désactive l'ancien accès (un seul actif)", async () => {
    const { deps, access } = adminDeps();
    await generateAccess({ ...deps, genToken: () => "tok-1" }, ctx, 5, "https://app.fr", NOW);
    await generateAccess({ ...deps, genToken: () => "tok-2" }, ctx, 5, "https://app.fr", NOW);
    expect(access.accesses.filter((a) => a.isActive)).toHaveLength(1);
    expect(access.accesses.find((a) => a.isActive)!.token).toBe("tok-2");
  });
});

describe("getStatus / deactivate", () => {
  it("getStatus renvoie le statut de l'accès actif, null sinon", async () => {
    const { deps, access } = adminDeps();
    await generateAccess(deps, ctx, 5, "https://app.fr", NOW);
    const st = await getStatus({ access }, ctx, 5);
    expect(st?.actif).toBe(true);
    expect(st?.token).toBe("tok-fixed");
    expect(await getStatus({ access }, ctx, 999)).toBeNull();
  });

  it("deactivate désactive l'accès", async () => {
    const { deps, access } = adminDeps();
    await generateAccess(deps, ctx, 5, "https://app.fr", NOW);
    expect(await deactivate({ access }, ctx, 5)).toEqual({ success: true });
    expect(await getStatus({ access }, ctx, 5)).toBeNull();
  });
});

describe("verifyAccess (public)", () => {
  it("token valide → {valid:true, client, artisan} + touch lastAccess", async () => {
    const access = new PortalAccessRepositoryFake({ clients: { 5: CLIENT }, artisans: { 1: ARTISAN }, accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "jean@x.fr", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: NOW }] });
    const res = await verifyAccess({ access }, "good", NOW);
    expect(res.valid).toBe(true);
    expect(res.client?.nom).toBe("Dupont");
    expect(res.artisan?.nomEntreprise).toBe("ACME");
    expect(access.accesses[0].lastAccessAt).toEqual(NOW);
  });

  it("token inconnu/expiré → {valid:false} (pas d'oracle)", async () => {
    const access = new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "exp", email: "x", expiresAt: new Date("2020-01-01"), isActive: true, lastAccessAt: null, createdAt: NOW }] });
    expect(await verifyAccess({ access }, "exp", NOW)).toEqual({ valid: false, client: null, artisan: null });
    expect(await verifyAccess({ access }, "inconnu", NOW)).toEqual({ valid: false, client: null, artisan: null });
  });
});

describe("getClientInfo (public)", () => {
  it("token valide → infos client + artisanEmail", async () => {
    const access = new PortalAccessRepositoryFake({ clients: { 5: CLIENT }, artisans: { 1: ARTISAN }, accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "jean@x.fr", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: NOW }] });
    const res = await getClientInfo({ access }, "good", NOW);
    expect(res?.nom).toBe("Dupont");
    expect(res?.artisanEmail).toBe("pro@acme.fr");
  });

  it("token invalide → Unauthorized", async () => {
    const access = new PortalAccessRepositoryFake();
    await expect(getClientInfo({ access }, "bad", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
