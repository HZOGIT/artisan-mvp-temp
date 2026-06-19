import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ICommandeRepository } from "./commande-repository";
import type { IFournisseurRepository } from "../../fournisseurs/application/fournisseur-repository";
import type { ArtisanReader } from "./artisan-reader";

/*
 * Dépendances de l'envoi d'un bon de commande par email (composition : commande + fournisseur +
 * artisan + PDF + email + rate-limit). Tout est injecté (interfaces) → testable sans infra ni legacy.
 */
export interface CommandeMailingDeps {
  readonly repo: ICommandeRepository;
  readonly fournisseurRepo: IFournisseurRepository;
  readonly artisanReader: ArtisanReader;
  readonly pdf: PdfPort;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
}

export interface EnvoiResult {
  readonly success: boolean;
  readonly message: string;
}

/** Même limiteur anti-abus que factures/avis, clé dédiée bon de commande par artisan. */
function rateLimitKey(artisanId: number): string {
  return `bc:${artisanId}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Corps HTML du mail de bon de commande (pur, testable) — parité fonctionnelle du template legacy. */
export function buildCommandeEmail(params: {
  artisanName: string;
  destinataire: string;
  numero: string;
  notes?: string | null;
}): { subject: string; body: string } {
  const { artisanName, destinataire, numero, notes } = params;
  const subject = `Bon de commande ${numero} - ${artisanName}`;
  const body =
    `<p>Bonjour ${escapeHtml(destinataire)},</p>` +
    `<p>Veuillez trouver ci-joint notre bon de commande <strong>${escapeHtml(numero)}</strong>.</p>` +
    (notes ? `<p>Notes : ${escapeHtml(notes)}</p>` : "") +
    `<p>Cordialement,<br/>${escapeHtml(artisanName)}</p>`;
  return { subject, body };
}

/*
 * Envoie un bon de commande par email (parité legacy `commandesFournisseurs.sendEmail`) :
 *  - ownership : commande du tenant (404 sinon) ;
 *  - **fournisseur.email requis** (400 sinon) ;
 *  - **rate-limit** anti-abus (429) ;
 *  - PDF bon de commande via `PdfPort` ({commande+lignes, artisan, fournisseur}) joint à l'email ;
 *  - statut → `envoyee` après envoi (parité legacy, inconditionnel).
 */
export async function envoyerCommandeParEmail(
  deps: CommandeMailingDeps,
  ctx: TenantContext,
  commandeId: number,
): Promise<EnvoiResult> {
  const commande = await deps.repo.getById(ctx, commandeId);
  if (!commande) throw new NotFoundError("Commande introuvable");

  const fournisseur = await deps.fournisseurRepo.getById(ctx, commande.fournisseurId);
  if (!fournisseur || !fournisseur.email) throw new ValidationError("Le fournisseur n'a pas d'adresse email");
  /** Capturé ici (narrowing non-null) : TS réinitialise le narrowing de propriété après les `await`. */
  const destinataireEmail = fournisseur.email;

  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Trop d'envois de bons de commande. Réessayez dans quelques minutes.");
  }

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const artisanName = artisan?.nomEntreprise || "Artisan";
  const lignes = await deps.repo.listLignes(ctx, commande.id);

  const numero = commande.numero ?? "";
  const { subject, body } = buildCommandeEmail({
    artisanName,
    destinataire: fournisseur.contact || fournisseur.nom,
    numero,
    notes: commande.notes,
  });

  const pdf = await deps.pdf.render("bon-commande", { commande: { ...commande, lignes }, artisan, fournisseur });
  await deps.email.send({
    to: destinataireEmail,
    subject,
    body,
    attachments: [{ filename: `bon-commande-${commande.numero || commande.id}.pdf`, content: pdf, contentType: "application/pdf" }],
  });

  await deps.repo.updateStatut(ctx, commande.id, "envoyee");
  return { success: true, message: `Bon de commande ${numero} envoyé à ${destinataireEmail}` };
}
