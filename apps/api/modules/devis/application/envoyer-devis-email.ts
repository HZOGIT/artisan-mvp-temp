import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { StoragePort } from "../../../shared/ports/storage";
import type { ArtisanReader, ClientReader } from "../../../shared/readers/contact-readers";
import type { IDevisRepository } from "./devis-repository";
import type { DevisSignatureReader } from "./devis-signature-reader";
import type { IModeleEmailRepository } from "../../modeles-email/application/modele-email-repository";
import { buildModeleEmail } from "../../modeles-email/domain/render";
import type { IPiecesJointesRepository } from "../../pieces-jointes/application/pieces-jointes-repository";
import type { IEmailLogWriter } from "../../emails/application/email-log-writer";

/*
 * Dépendances de l'envoi d'un devis par email (composition : artisan + client + PDF + email +
 * rate-limit). Tout est injecté (interfaces) → testable sans infra ni legacy.
 */
export interface DevisMailingDeps {
  readonly artisanReader: ArtisanReader;
  readonly clientReader: ClientReader;
  readonly pdf: PdfPort;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
  readonly signatureReader: DevisSignatureReader;
  readonly appUrl: string;
  /** Optionnel : si présent, le modèle `isDefault` du type `envoi_devis` remplace le gabarit codé en dur. */
  readonly modeleEmailRepo?: IModeleEmailRepository;
  /** Optionnel : pièces jointes (plans, photos…) attachables à l'email. */
  readonly piecesJointesRepo?: IPiecesJointesRepository;
  readonly storage?: StoragePort;
  readonly emailLogWriter?: IEmailLogWriter;
}

export interface EnvoyerDevisEmailInput {
  readonly devisId: number;
  readonly customMessage?: string;
  readonly attachPdf: boolean;
  /** Identifiants des pièces jointes à inclure (en plus du PDF). */
  readonly pieceJointeIds?: readonly number[];
}

export interface EnvoiResult {
  readonly success: boolean;
  readonly message: string;
}

function rateLimitKey(artisanId: number): string {
  return `devis:${artisanId}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Sujet + corps HTML de l'email devis (pur, testable) — parité fonctionnelle du template legacy
 * `generateDevisEmailContent`. `customMessage` éventuel ajouté en bas (échappé).
 * `portalUrl` : lien de signature en ligne (`/devis-public/<token>`), ajouté si disponible.
 */
export function buildDevisEmail(params: {
  artisanName: string;
  clientName: string;
  numero: string;
  objet?: string | null;
  totalTTC: string;
  dateValidite?: string | null;
  customMessage?: string | null;
  portalUrl?: string | null;
}): { subject: string; body: string } {
  const { artisanName, clientName, numero, objet, totalTTC, dateValidite, customMessage, portalUrl } = params;
  const subject = `Devis ${numero}${objet ? ` - ${objet}` : ""} de ${artisanName}`;
  const validite = dateValidite
    ? `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Validité</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #dbeafe;">${escapeHtml(dateValidite)}</td></tr>`
    : "";
  const note = customMessage
    ? `<tr><td colspan="2" style="padding:16px 0 0 0;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;">${escapeHtml(customMessage)}</td></tr>`
    : "";
  const signatureButton = portalUrl
    ? `<tr><td style="padding:28px 40px 0 40px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#1e40af;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;">Consulter et signer en ligne</a>
       </td></tr>`
    : "";
  const body = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(artisanName)}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${escapeHtml(clientName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint notre devis <strong>${escapeHtml(numero)}</strong>${objet ? ` concernant <em>&laquo;&nbsp;${escapeHtml(objet)}&nbsp;&raquo;</em>` : ""}.</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de devis</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(numero)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Montant TTC</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:700;text-align:right;border-top:1px solid #dbeafe;">${escapeHtml(totalTTC)}</td></tr>
                ${validite}
                ${note}
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${signatureButton}
        <tr><td style="padding:${portalUrl ? "16px" : "0"} 40px 36px 40px;"></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, body };
}

/*
 * Envoie un devis par email (parité legacy `devis.sendByEmail`) : ownership 404, **client.email
 * requis 400**, **rate-limit 429** ; si `attachPdf` → PDF via `PdfPort.render("devis", …)` joint ;
 * **passe `envoye` si le devis est `brouillon`** (durci vs legacy : ne régresse pas accepte/refuse).
 */
export async function envoyerDevisParEmail(
  repo: IDevisRepository,
  deps: DevisMailingDeps,
  ctx: TenantContext,
  input: EnvoyerDevisEmailInput,
): Promise<EnvoiResult> {
  const devis = await repo.getById(ctx, input.devisId);
  if (!devis) throw new NotFoundError("Devis introuvable");

  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");

  const client = await deps.clientReader.getClient(ctx, devis.clientId);
  if (!client || !client.email) throw new ValidationError("Le client n'a pas d'adresse email");
  const destinataireEmail = client.email;

  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Trop d'envois de devis par email. Réessayez dans quelques minutes.");
  }

  const artisanName = artisan.nomEntreprise || "Votre artisan";
  const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
  const totalTTC = `${(parseFloat(devis.totalTTC || "0") || 0).toFixed(2)} €`;
  const dateValidite = devis.dateValidite ? new Date(devis.dateValidite).toLocaleDateString("fr-FR") : null;

  const signature = await deps.signatureReader.getByDevisId(ctx, devis.id);
  const portalUrl = signature ? `${deps.appUrl}/devis-public/${signature.token}` : null;

  const modele = deps.modeleEmailRepo ? await deps.modeleEmailRepo.getDefaultByType(ctx, "envoi_devis") : null;
  const { subject, body } = modele
    ? buildModeleEmail(
        modele,
        {
          client_nom: clientName,
          client_prenom: client.prenom ?? "",
          numero: devis.numero,
          montant_ttc: totalTTC,
          date_validite: dateValidite ?? "",
          lien_signature: portalUrl ?? "",
          nom_entreprise: artisanName,
        },
        input.customMessage ?? null,
      )
    : buildDevisEmail({
        artisanName,
        clientName,
        numero: devis.numero,
        objet: devis.objet,
        totalTTC,
        dateValidite,
        customMessage: input.customMessage ?? null,
        portalUrl,
      });

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  if (input.attachPdf) {
    const lignes = await repo.listLignes(ctx, devis.id);
    const pdf = await deps.pdf.render("devis", { devis: { ...devis, lignes }, artisan, client });
    attachments.push({ filename: `Devis_${devis.numero}.pdf`, content: pdf, contentType: "application/pdf" });
  }

  if (input.pieceJointeIds?.length && deps.piecesJointesRepo && deps.storage) {
    const requestedIds = input.pieceJointeIds;
    const allPieces = await deps.piecesJointesRepo.listByDevis(ctx, devis.id);
    const selected = allPieces.filter((p) => requestedIds.includes(p.id));
    for (const piece of selected) {
      const buf = await deps.storage.get(piece.storageKey);
      if (buf) attachments.push({ filename: piece.filename ?? `piece-${piece.id}`, content: buf, contentType: piece.mimeType });
    }
  }

  await deps.email.send({ to: destinataireEmail, subject, body, ...(attachments.length ? { attachments } : {}), fromName: artisan.nomEntreprise ?? undefined, replyTo: artisan.email ?? undefined });

  if (deps.emailLogWriter) {
    await deps.emailLogWriter.create({ artisanId: ctx.artisanId, destinataire: destinataireEmail, sujet: subject, type: "envoi_devis", entiteType: "devis", entiteId: devis.id }).catch(() => { /* ponytail: best-effort — emailLogWriter non-critique */ });
  }

  /** Envoi réussi : passage `envoye` depuis brouillon uniquement (ne régresse pas un devis émis/signé). */
  if (devis.statut === "brouillon") {
    await repo.setStatut(ctx, devis.id, "envoye");
  }

  return { success: true, message: `Devis ${devis.numero} envoyé à ${destinataireEmail}` };
}
