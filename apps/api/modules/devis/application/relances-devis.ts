import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ClientReader, ArtisanInfo, ClientInfo } from "../../../shared/readers/contact-readers";
import type { IDevisRepository } from "./devis-repository";
import type { IRelanceDevisRepository } from "../../relances-devis/application/relance-devis-repository";
import type { IModeleEmailRepository } from "../../modeles-email/application/modele-email-repository";
import { buildModeleEmail } from "../../modeles-email/domain/render";

/*
 * Dépendances des relances de devis (composition : devis + relances + client/artisan + email +
 * rate-limit). Tout injecté → testable sans infra ni legacy.
 */
export interface DevisRelanceDeps {
  readonly devisRepo: IDevisRepository;
  readonly relanceRepo: IRelanceDevisRepository;
  readonly clientReader: ClientReader;
  readonly artisanReader: ArtisanReader;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
  readonly maintenant?: () => Date;
  /** Optionnel : si présent, le modèle `isDefault` du type `relance_devis` remplace le gabarit codé en dur. */
  readonly modeleEmailRepo?: IModeleEmailRepository;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientNom(client: ClientInfo): string {
  return client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
}

/** Message de relance par défaut (parité legacy) si l'appelant n'en fournit pas. */
function messageParDefaut(numero: string, artisanName: string, nomClient?: string): string {
  const salutation = nomClient ? `Bonjour ${nomClient},` : "Bonjour,";
  return `${salutation}\n\nNous vous rappelons que le devis n°${numero} est toujours en attente de votre signature.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${artisanName}`;
}

/** Corps HTML de l'email de relance (pur). Le message libre est échappé (anti-XSS). */
function buildRelanceBody(numero: string, message: string, artisan: ArtisanInfo | null): string {
  const a = (k: string): string => escapeHtml(String(artisan?.[k] ?? ""));
  return (
    `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">` +
    `<h2 style="color: #2c3e50;">Relance - Devis n°${escapeHtml(numero)}</h2>` +
    `<p>${escapeHtml(message)}</p>` +
    `<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">` +
    `<p style="color: #7f8c8d; font-size: 12px;">${a("nomEntreprise")}<br>${a("adresse")}<br>${a("codePostal")} ${a("ville")}<br>${a("telephone")}</p>` +
    `</div>`
  );
}

/** Envoie l'email + enregistre la relance (journal append-only). Renvoie le succès de l'envoi. */
async function envoyerEtEnregistrer(
  deps: DevisRelanceDeps,
  ctx: TenantContext,
  devisId: number,
  client: ClientInfo & { email: string },
  emailContent: { subject: string; body: string; fromName?: string; replyTo?: string },
  message: string,
): Promise<boolean> {
  let ok = true;
  try {
    await deps.email.send({ to: client.email, subject: emailContent.subject, body: emailContent.body, fromName: emailContent.fromName, replyTo: emailContent.replyTo });
  } catch {
    ok = false;
  }
  await deps.relanceRepo.create(ctx, {
    devisId,
    type: "email",
    destinataire: client.email,
    message,
    statut: ok ? "envoye" : "echec",
  });
  return ok;
}

/*
 * Envoie une relance pour un devis (parité legacy `devis.envoyerRelance`) : ownership 404,
 * **client.email requis 400**, **rate-limit 429** (`relance:${artisanId}`), email best-effort +
 * **enregistrement de la relance** (statut envoye/echec). Renvoie toujours `{success:true}` (le
 * résultat d'envoi est porté par le statut de la relance — parité legacy).
 */
export async function envoyerRelanceDevis(
  deps: DevisRelanceDeps,
  ctx: TenantContext,
  input: { devisId: number; message?: string },
): Promise<{ success: boolean; message: string }> {
  const devis = await deps.devisRepo.getById(ctx, input.devisId);
  if (!devis) throw new NotFoundError("Devis introuvable");
  if (devis.statut === "accepte" || devis.statut === "refuse") {
    throw new ValidationError("Impossible d'envoyer une relance sur un devis accepté ou refusé");
  }

  const client = await deps.clientReader.getClient(ctx, devis.clientId);
  if (!client || !client.email) throw new ValidationError("Le client n'a pas d'adresse email");

  if (!(await deps.rateLimiter.check(`relance:${ctx.artisanId}`))) {
    throw new TooManyRequestsError("Trop de relances envoyées. Réessayez dans quelques minutes.");
  }

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const artisanName = artisan?.nomEntreprise || "Votre artisan";
  const message = input.message || messageParDefaut(devis.numero, artisanName);
  const modele = deps.modeleEmailRepo ? await deps.modeleEmailRepo.getDefaultByType(ctx, "relance_devis") : null;
  const emailContent = modele
    ? buildModeleEmail(
        modele,
        { client_nom: clientNom(client), client_prenom: client.prenom ?? "", numero: devis.numero, nom_entreprise: artisanName },
        input.message ?? null,
      )
    : { subject: `Relance - Devis n°${devis.numero}`, body: buildRelanceBody(devis.numero, message, artisan) };
  await envoyerEtEnregistrer(deps, ctx, devis.id, { ...client, email: client.email }, { ...emailContent, fromName: artisanName, replyTo: artisan?.email ?? undefined }, message);
  return { success: true, message: "Relance envoyée avec succès" };
}

/*
 * Envoie des relances pour TOUS les devis non signés ≥ joursMinimum, en respectant un délai
 * `joursEntreRelances` depuis la dernière relance (parité legacy `devis.envoyerRelancesAutomatiques`).
 * rate-limit `relance-auto:${artisanId}`. Renvoie le nombre de relances effectivement envoyées.
 */
export async function envoyerRelancesAutomatiques(
  deps: DevisRelanceDeps,
  ctx: TenantContext,
  input: { joursMinimum?: number; joursEntreRelances?: number } = {},
): Promise<{ success: boolean; relancesEnvoyees: number }> {
  if (!(await deps.rateLimiter.check(`relance-auto:${ctx.artisanId}`))) {
    throw new TooManyRequestsError("Trop de relances en masse. Réessayez dans quelques minutes.");
  }
  const joursMinimum = input.joursMinimum ?? 7;
  const joursEntreRelances = input.joursEntreRelances ?? 7;
  const now = (deps.maintenant ?? (() => new Date()))();
  const jours = (d: Date): number => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const artisanName = artisan?.nomEntreprise || "Votre artisan";
  const modele = deps.modeleEmailRepo ? await deps.modeleEmailRepo.getDefaultByType(ctx, "relance_devis") : null;
  const nonSignes = await deps.devisRepo.listNonSignes(ctx);
  let relancesEnvoyees = 0;

  for (const d of nonSignes) {
    if (jours(d.dateDevis) < joursMinimum) continue;
    const relances = await deps.relanceRepo.listByDevis(ctx, d.id);
    const derniere = relances.reduce<Date | null>((max, r) => (!max || r.createdAt > max ? r.createdAt : max), null);
    if (derniere && jours(derniere) < joursEntreRelances) continue;
    const client = await deps.clientReader.getClient(ctx, d.clientId);
    if (!client || !client.email) continue;
    const message = messageParDefaut(d.numero, artisanName, clientNom(client));
    const emailContent = modele
      ? buildModeleEmail(
          modele,
          { client_nom: clientNom(client), client_prenom: client.prenom ?? "", numero: d.numero, nom_entreprise: artisanName },
          null,
        )
      : { subject: `Relance - Devis n°${d.numero}`, body: buildRelanceBody(d.numero, message, artisan) };
    const ok = await envoyerEtEnregistrer(deps, ctx, d.id, { ...client, email: client.email }, { ...emailContent, fromName: artisanName, replyTo: artisan?.email ?? undefined }, message);
    if (ok) relancesEnvoyees++;
  }
  return { success: true, relancesEnvoyees };
}
