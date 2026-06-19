import { NotFoundError, TooManyRequestsError, UnauthorizedError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort } from "../../../shared/ports/llm";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import { getContexteMetier } from "../../../shared/ia/contexte-metier";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";
import type { IPortalAccessRepository } from "./portal-access-repository";

export interface DemandeIAStructured {
  titre: string;
  descriptionReformulee: string;
  typeTravaux: string;
  urgence: "faible" | "normale" | "urgente";
  estimationMin: number | null;
  estimationMax: number | null;
  questions: string[];
}

export interface SoumettreDemandeIADeps {
  readonly access: Pick<IPortalAccessRepository, "resolveByToken">;
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ nom: string; prenom: string | null; email: string | null; telephone: string | null } | null> };
  readonly artisanInfoReader: ArtisanReader;
  readonly llm: LlmPort;
  readonly rateLimiter: { check(key: string): Promise<boolean> };
  readonly notifications: { creer(ctx: TenantContext, input: { type: "info"; titre: string; message: string; lien: string }): Promise<unknown> };
  readonly email: { send(message: { to: string; subject: string; body: string }): Promise<void> };
}

function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/*
 * Structure une demande client (texte libre) via l'IA pour l'artisan (parité legacy `soumettreDemandeIA`).
 * Rate-limit IA côté artisan → 429 (mutation). **Dégradation propre** : LLM KO / JSON non parsable →
 * objet structuré par défaut (titre tronqué + texte brut). Notif + email artisan best-effort.
 */
export async function soumettreDemandeIA(deps: SoumettreDemandeIADeps, token: string, description: string): Promise<{ success: true; structured: DemandeIAStructured }> {
  const access = await deps.access.resolveByToken(token, new Date());
  if (!access) throw new UnauthorizedError("Accès non autorisé");
  const ctx: TenantContext = { artisanId: access.artisanId, userId: 0 };

  const [client, artisan] = await Promise.all([deps.clients.getById(ctx, access.clientId), deps.artisanInfoReader.getArtisan(ctx)]);
  if (!client || !artisan) throw new NotFoundError("Données introuvables");

  if (!(await deps.rateLimiter.check(`ia:${access.artisanId}`))) {
    throw new TooManyRequestsError("Trop de demandes, reessayez plus tard");
  }

  const metier = (artisan.metier as string | null | undefined) || (artisan.specialite as string | null | undefined) || null;
  const contexteMetier = getContexteMetier(metier);
  const clientName = `${client.prenom || ""} ${client.nom}`.trim();

  const structured: DemandeIAStructured = {
    titre: description.slice(0, 60),
    descriptionReformulee: description,
    typeTravaux: "Non determine",
    urgence: "normale",
    estimationMin: null,
    estimationMax: null,
    questions: [],
  };

  try {
    const prompt = `Un client (${clientName}) decrit son besoin sur le portail :
"""
${description}
"""

Tache : structure cette demande pour l'artisan. Donne un titre court, reformule clairement, identifie le type de travaux, estime l'urgence (faible/normale/urgente), donne une fourchette de prix realiste marche francais 2024 (estimation_min et estimation_max en euros TTC) et propose 2 a 3 questions de precision a poser au client pour pouvoir chiffrer.

Reponds UNIQUEMENT en JSON pur (pas de markdown, pas de texte avant/apres) :
{"titre":"court","description_reformulee":"clair","type_travaux":"libelle","urgence":"normale","estimation_min":0,"estimation_max":0,"questions":["q1","q2"]}`;
    const text = await deps.llm.complete(prompt, { system: contexteMetier, temperature: 0.4, maxOutputTokens: 1200 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      structured.titre = String(data.titre || structured.titre).slice(0, 120);
      structured.descriptionReformulee = String(data.description_reformulee || description).slice(0, 1500);
      structured.typeTravaux = String(data.type_travaux || "Non determine").slice(0, 80);
      structured.urgence = (["faible", "normale", "urgente"] as const).includes(data.urgence as never) ? (data.urgence as DemandeIAStructured["urgence"]) : "normale";
      structured.estimationMin = Number.isFinite(Number(data.estimation_min)) ? Number(data.estimation_min) : null;
      structured.estimationMax = Number.isFinite(Number(data.estimation_max)) ? Number(data.estimation_max) : null;
      structured.questions = Array.isArray(data.questions) ? data.questions.slice(0, 5).map((q) => String(q).slice(0, 200)) : [];
    }
  } catch (e) {
    console.warn("[soumettreDemandeIA]", sanitizeIaError(e)); // dégradation : on garde `structured` par défaut
  }

  const fourchette = structured.estimationMin && structured.estimationMax ? `${structured.estimationMin}-${structured.estimationMax} €` : "à chiffrer";
  const urgenceLabel = structured.urgence === "urgente" ? "Urgente" : structured.urgence === "faible" ? "Faible" : "Normale";

  try {
    await deps.notifications.creer(ctx, { type: "info", titre: `Nouvelle demande : ${structured.titre}`, message: `${clientName} — ${structured.typeTravaux} — Devis estime : ${fourchette} (${urgenceLabel})`, lien: "/clients" });
  } catch {
    /* best-effort */
  }

  if (artisan.email) {
    try {
      const questionsHtml = structured.questions.length ? `<p style="margin-top:16px;"><strong>Questions a poser au client :</strong></p><ul>${structured.questions.map((q) => `<li>${safeHtml(q)}</li>`).join("")}</ul>` : "";
      await deps.email.send({
        to: artisan.email,
        subject: `Nouvelle demande portail : ${structured.titre}`,
        body: `<p>Nouvelle demande de <strong>${safeHtml(clientName)}</strong> (${safeHtml(client.email || "pas d'email")} - ${safeHtml(client.telephone || "pas de tel")}) via le portail client.</p>
<p><strong>Type :</strong> ${safeHtml(structured.typeTravaux)} &nbsp;|&nbsp; <strong>Urgence :</strong> ${urgenceLabel} &nbsp;|&nbsp; <strong>Devis estime :</strong> ${fourchette}</p>
<p><strong>Description reformulee par l'IA :</strong></p>
<blockquote style="border-left:3px solid #8b5cf6;padding:12px;margin:16px 0;background:#f8fafc;">${safeHtml(structured.descriptionReformulee)}</blockquote>
<p><strong>Texte original du client :</strong></p>
<blockquote style="border-left:3px solid #cbd5e1;padding:12px;margin:16px 0;background:#f8fafc;color:#475569;">${safeHtml(description)}</blockquote>
${questionsHtml}`,
      });
    } catch {
      /* best-effort */
    }
  }

  return { success: true, structured };
}
