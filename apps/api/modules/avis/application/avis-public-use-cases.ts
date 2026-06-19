import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PublicDemandeAvisReader } from "./public-demande-reader";

/*
 * ── Ports tenant-scopés des effets publics (résolus APRÈS la demande via withTenant(artisanId)) ──
 * Contexte d'affichage de la demande (noms artisan/client/intervention) — lu sous le tenant résolu.
 */
export interface DemandeAvisContext {
  readonly artisanNomEntreprise: string | null;
  readonly clientNom: string | null;
  readonly interventionTitre: string | null;
  readonly interventionDateDebut: Date | null;
}
export interface PublicDemandeContextReader {
  getContext(ctx: TenantContext, clientId: number, interventionId: number): Promise<DemandeAvisContext>;
}

/*
 * Écriture de la soumission publique : insère l'avis (publie) + marque la demande completee + notifie
 * l'artisan, le tout sous le tenant résolu (RLS) — transaction unique.
 */
export interface SoumettreAvisData {
  readonly demandeId: number;
  readonly clientId: number;
  readonly interventionId: number;
  readonly note: number;
  readonly commentaire: string | null;
  readonly tokenAvis: string;
}
export interface PublicAvisWriter {
  soumettre(ctx: TenantContext, data: SoumettreAvisData): Promise<void>;
}

export interface AvisPublicDeps {
  readonly reader: PublicDemandeAvisReader;
  readonly contextReader: PublicDemandeContextReader;
  readonly writer: PublicAvisWriter;
  readonly maintenant?: () => Date;
  readonly genererToken?: () => string;
}

export interface DemandeAvisInfo {
  readonly demande: { readonly id: number; readonly statut: string; readonly expiresAt: Date };
  readonly artisan: { readonly nomEntreprise: string | null } | null;
  readonly client: { readonly nom: string | null } | null;
  readonly intervention: { readonly titre: string | null; readonly dateDebut: Date | null } | null;
  readonly isExpired: boolean;
  readonly isCompleted: boolean;
}

/*
 * Page publique : infos d'une demande d'avis par token (parité legacy `avis.getDemandeInfo`). Le
 * token EST la capacité (lecture via `withPublicToken`) ; **anti-oracle** : token inconnu → 404
 * uniforme. Les noms sont lus sous le tenant résolu (`withTenant(artisanId)`).
 */
export async function getInfoDemandeAvis(deps: AvisPublicDeps, token: string): Promise<DemandeAvisInfo> {
  const demande = await deps.reader.getByToken(token);
  if (!demande) throw new NotFoundError("Demande d'avis introuvable");
  const now = (deps.maintenant ?? (() => new Date()))();
  const ctx: TenantContext = { artisanId: demande.artisanId, userId: 0 };
  const c = await deps.contextReader.getContext(ctx, demande.clientId, demande.interventionId);
  return {
    demande: { id: demande.id, statut: demande.statut, expiresAt: demande.expiresAt },
    artisan: { nomEntreprise: c.artisanNomEntreprise },
    client: { nom: c.clientNom },
    intervention: { titre: c.interventionTitre, dateDebut: c.interventionDateDebut },
    isExpired: now > demande.expiresAt,
    isCompleted: demande.statut === "completee",
  };
}

/*
 * Soumission publique d'un avis (parité legacy `avis.submitAvis`) : token → demande ; **400** si déjà
 * complétée ou expirée ; sinon crée l'avis (publie) + marque la demande + notifie l'artisan (sous le
 * tenant résolu). `note` 1–5 (borné au routeur). Anti-oracle : token inconnu → 404 uniforme.
 */
export async function soumettreAvisPublic(
  deps: AvisPublicDeps,
  input: { token: string; note: number; commentaire?: string },
): Promise<{ success: boolean }> {
  const demande = await deps.reader.getByToken(input.token);
  if (!demande) throw new NotFoundError("Demande d'avis introuvable");
  if (demande.statut === "completee") throw new ValidationError("Vous avez déjà donné votre avis");
  const now = (deps.maintenant ?? (() => new Date()))();
  if (now > demande.expiresAt) throw new ValidationError("Ce lien a expiré");

  const ctx: TenantContext = { artisanId: demande.artisanId, userId: 0 };
  const tokenAvis = (deps.genererToken ?? (() => crypto.randomUUID()))();
  await deps.writer.soumettre(ctx, {
    demandeId: demande.id,
    clientId: demande.clientId,
    interventionId: demande.interventionId,
    note: input.note,
    commentaire: input.commentaire ?? null,
    tokenAvis,
  });
  return { success: true };
}
