import { describe, it, expect } from "vitest";
import { TooManyRequestsError, UnauthorizedError } from "../../../shared/errors";
import type { LlmPort } from "../../../shared/ports/llm";
import { PortalAccessRepositoryFake } from "../infra/portal-access-repository-fake";
import { soumettreDemandeIA, type SoumettreDemandeIADeps } from "./ia-use-cases";

const access = () => new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "x", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: new Date() }] });

const STUB_USAGE: import("../../../shared/ports/llm").LlmResult["usage"] = {
  model: "stub", durationMs: 0, finishReason: "STOP",
  promptTokens: 0, responseTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  textInputTokens: 0, audioInputTokens: 0, imageInputTokens: 0, videoInputTokens: 0,
  textOutputTokens: 0, audioOutputTokens: 0, trafficType: null,
};
const okLlm: LlmPort = {
  complete: async () => ({ text: '{"titre":"Fuite salle de bain","description_reformulee":"Fuite sous le lavabo","type_travaux":"Plomberie","urgence":"urgente","estimation_min":150,"estimation_max":300,"questions":["Depuis quand ?","Quel etage ?"]}', usage: STUB_USAGE }),
  stream: async function* () {},
};
const koLlm: LlmPort = { complete: async () => { throw new Error("provider down"); }, stream: async function* () {} };

function build(over: Partial<SoumettreDemandeIADeps> = {}): { deps: SoumettreDemandeIADeps; sent: any[]; notifs: any[] } {
  const sent: any[] = [];
  const notifs: any[] = [];
  const deps: SoumettreDemandeIADeps = {
    access: access(),
    clients: { getById: async () => ({ nom: "Dupont", prenom: "Jean", email: "jean@x.fr", telephone: "06" }) },
    artisanInfoReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME", email: "pro@acme.fr", specialite: "plomberie" } as never) },
    llm: okLlm,
    rateLimiter: { check: async () => true },
    notifications: { creer: async (_c, i) => { notifs.push(i); return {}; } },
    email: { send: async (m) => { sent.push(m); } },
    ...over,
  };
  return { deps, sent, notifs };
}

describe("soumettreDemandeIA", () => {
  it("succès LLM → structure parsée + notif + email artisan", async () => {
    const { deps, sent, notifs } = build();
    const res = await soumettreDemandeIA(deps, "good", "J'ai une fuite sous mon lavabo depuis hier");
    expect(res.success).toBe(true);
    expect(res.structured.titre).toBe("Fuite salle de bain");
    expect(res.structured.urgence).toBe("urgente");
    expect(res.structured.estimationMin).toBe(150);
    expect(res.structured.questions).toHaveLength(2);
    expect(notifs[0].titre).toContain("Fuite salle de bain");
    expect(sent[0].to).toBe("pro@acme.fr");
  });

  it("LLM en échec → dégradation propre (structure par défaut = texte brut), pas d'exception", async () => {
    const { deps } = build({ llm: koLlm });
    const res = await soumettreDemandeIA(deps, "good", "Texte brut de la demande client");
    expect(res.success).toBe(true);
    expect(res.structured.typeTravaux).toBe("Non determine");
    expect(res.structured.descriptionReformulee).toBe("Texte brut de la demande client");
  });

  it("rate-limit IA atteint → TooManyRequests", async () => {
    const { deps } = build({ rateLimiter: { check: async () => false } });
    await expect(soumettreDemandeIA(deps, "good", "Une demande quelconque")).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("token invalide → Unauthorized", async () => {
    const { deps } = build();
    await expect(soumettreDemandeIA(deps, "bad", "Une demande quelconque")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
