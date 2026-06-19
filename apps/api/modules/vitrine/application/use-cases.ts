import { ConflictError, NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IVitrinePublicReader } from "./vitrine-public-reader";
import { computeAvisStats, resoudreServices, safeHtml } from "../domain/vitrine";
import type { DemandeContact } from "../../demandes-contact/domain/demande-contact";

/*
 * ── getBySlug (public) ────────────────────────────────────────────────────────
 * Assemble la page vitrine publique d'un artisan résolu par slug (404 si inconnu ou vitrine inactive).
 */
export async function getBySlug(reader: IVitrinePublicReader, slug: string): Promise<unknown> {
  const artisan = await reader.getArtisanBySlug(slug);
  if (!artisan) throw new NotFoundError("Page vitrine non trouvee");

  const params = await reader.getVitrineParams(artisan.id);
  if (!params?.vitrineActive) throw new NotFoundError("Cette vitrine n'est pas active");

  const [avis, publicStats, categories] = await Promise.all([
    reader.getPublishedAvis(artisan.id),
    reader.getPublicStats(artisan.id),
    reader.getArticleCategories(artisan.id),
  ]);

  return {
    artisan: {
      nomEntreprise: artisan.nomEntreprise,
      specialite: artisan.specialite,
      telephone: artisan.telephone,
      email: artisan.email,
      ville: artisan.ville,
      codePostal: artisan.codePostal,
      adresse: artisan.adresse,
      siret: artisan.siret,
      logo: artisan.logo,
    },
    vitrine: {
      description: params.vitrineDescription,
      zone: params.vitrineZone,
      services: resoudreServices(params.vitrineServices, categories),
      experience: params.vitrineExperience,
    },
    avis,
    avisStats: computeAvisStats(avis),
    publicStats,
  };
}

// ── submitContact (public) ────────────────────────────────────────────────────
export interface SubmitContactInput {
  readonly slug: string;
  readonly nom: string;
  readonly email: string;
  readonly telephone?: string;
  readonly message: string;
}

export interface SubmitContactDeps {
  readonly reader: Pick<IVitrinePublicReader, "getArtisanBySlug" | "getVitrineParams">;
  readonly rateLimiter: { check(key: string): Promise<boolean> };
  readonly email: { send(message: { to: string; subject: string; body: string }): Promise<void> };
  readonly notifications: { creer(ctx: TenantContext, input: { type: "info"; titre: string; message: string; lien: string }): Promise<unknown> };
  readonly leads: LeadRepo;
}

/*
 * Formulaire de contact public d'une vitrine (parité legacy `submitContact`). Résout l'artisan par
 * slug (+ email requis) → 404 ; vitrine inactive → 404 (pas de contact sur une page éteinte) ;
 * anti-flood par IP (5/15 min) → 429. Envoie l'email à l'artisan, crée une notification in-app et
 * persiste le lead (best-effort). L'IP est fournie par l'appelant (en-tête probant).
 */
export async function submitContact(deps: SubmitContactDeps, input: SubmitContactInput, clientIp: string): Promise<{ success: true }> {
  const artisan = await deps.reader.getArtisanBySlug(input.slug);
  if (!artisan || !artisan.email) throw new NotFoundError("Artisan non trouve");

  const params = await deps.reader.getVitrineParams(artisan.id);
  if (!params?.vitrineActive) throw new NotFoundError("Cette vitrine n'est pas active");

  if (!(await deps.rateLimiter.check(`vitrine-contact:${clientIp}`))) {
    throw new TooManyRequestsError("Trop de messages envoyés. Réessayez dans quelques minutes.");
  }

  await deps.email.send({
    to: artisan.email,
    subject: `Nouveau contact via votre vitrine - ${input.nom}`,
    body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#1e40af;">Nouveau message depuis votre page vitrine</h2>
          <p><strong>Nom :</strong> ${safeHtml(input.nom)}</p>
          <p><strong>Email :</strong> ${safeHtml(input.email)}</p>
          ${input.telephone ? `<p><strong>Telephone :</strong> ${safeHtml(input.telephone)}</p>` : ""}
          <hr style="border:1px solid #e5e7eb;margin:20px 0;" />
          <p>${safeHtml(input.message)}</p>
          <hr style="border:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#6b7280;font-size:12px;">Message envoye depuis votre page vitrine Operioz</p>
        </body></html>`,
  });

  // Écritures scopées sous le tenant de l'artisan résolu (RLS withCheck = artisanId).
  const ctx: TenantContext = { artisanId: artisan.id, userId: 0 };
  // Notification in-app (best-effort : ne casse pas la soumission si l'insert échoue).
  try {
    await deps.notifications.creer(ctx, {
      type: "info",
      titre: "Nouveau contact vitrine",
      message: `${input.nom} vous a envoye un message via votre page vitrine`,
      lien: "/parametres",
    });
  } catch {
    /* best-effort */
  }
  // Persistance du lead (best-effort, parité legacy).
  try {
    await deps.leads.create(ctx, { nom: input.nom, email: input.email, telephone: input.telephone ?? null, message: input.message, source: "vitrine" });
  } catch {
    /* best-effort */
  }

  return { success: true };
}

/*
 * ── Gestion des leads (ADMIN, protégé) ────────────────────────────────────────
 * Délègue au domaine migré `demandesContact` (leads) + au repo `clients` pour la conversion. Parité
 * legacy (statut posé en direct + ownership scopé tenant) plutôt que la machine à états de
 * `demandesContact` (la vitrine est la surface historique de ces opérations).
 */
export type LeadStatut = "nouveau" | "contacte" | "converti" | "perdu";

export interface LeadRepo {
  /*
   * typé `DemandeContact[]` (le repo `demandes-contact` renvoie déjà ce DTO) — le front
   * dérive donc `RouterOutputs["vitrine"]["getDemandesContact"]` sans assertion.
   */
  list(ctx: TenantContext): Promise<DemandeContact[]>;
  getById(ctx: TenantContext, id: number): Promise<{ id: number; clientId: number | null; nom: string; email: string | null; telephone: string | null } | null>;
  setStatut(ctx: TenantContext, id: number, statut: LeadStatut, clientId?: number | null): Promise<unknown>;
  create(ctx: TenantContext, input: { nom: string; email?: string | null; telephone?: string | null; message?: string | null; source?: string }): Promise<unknown>;
}
export interface ClientCreator {
  create(ctx: TenantContext, input: { nom: string; email?: string | null; telephone?: string | null }): Promise<{ id: number }>;
}
export interface LeadsAdminDeps {
  readonly leads: LeadRepo;
  readonly clients: ClientCreator;
}

export function getDemandesContact(deps: LeadsAdminDeps, ctx: TenantContext): Promise<DemandeContact[]> {
  return deps.leads.list(ctx);
}

// Met à jour le statut d'un lead (suivi). Ownership scopé tenant (404 anti-IDOR), puis set direct (parité).
export async function updateDemandeContactStatut(deps: LeadsAdminDeps, ctx: TenantContext, id: number, statut: LeadStatut): Promise<{ success: true }> {
  const demande = await deps.leads.getById(ctx, id);
  if (!demande) throw new NotFoundError("Demande non trouvée");
  await deps.leads.setStatut(ctx, id, statut);
  return { success: true };
}

/*
 * Convertit un lead en client : crée le client (nom/email/téléphone du lead) puis lie + passe converti.
 * 404 si lead hors tenant ; 409 si déjà converti (parité legacy BAD_REQUEST → ConflictError).
 */
export async function convertirDemandeEnClient(deps: LeadsAdminDeps, ctx: TenantContext, id: number): Promise<{ success: true; clientId: number }> {
  const demande = await deps.leads.getById(ctx, id);
  if (!demande) throw new NotFoundError("Demande non trouvée");
  if (demande.clientId) throw new ConflictError("Demande déjà convertie");
  const client = await deps.clients.create(ctx, { nom: demande.nom, email: demande.email ?? undefined, telephone: demande.telephone ?? undefined });
  await deps.leads.setStatut(ctx, id, "converti", client.id);
  return { success: true, clientId: client.id };
}
