import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import { round2 } from "../../../shared/money";
import type { IFactureRepository } from "./facture-repository";
import type { ArtisanReader, ClientReader } from "./contact-readers";
import type { IModeleEmailRepository } from "../../modeles-email/application/modele-email-repository";
import { buildModeleEmail } from "../../modeles-email/domain/render";

/*
 * Dépendances de l'envoi d'une facture par email (composition cross-domaine : artisan + client +
 * PDF + email + rate-limit). Tout est injecté (interfaces) → testable sans infra ni legacy.
 */
export interface FactureMailingDeps {
  readonly artisanReader: ArtisanReader;
  readonly clientReader: ClientReader;
  readonly pdf: PdfPort;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
  /** Optionnel : si présent, le modèle `isDefault` du type `envoi_facture` remplace le gabarit codé en dur. */
  readonly modeleEmailRepo?: IModeleEmailRepository;
}

export interface EnvoyerFactureEmailInput {
  readonly factureId: number;
  readonly customMessage?: string;
  readonly attachPdf: boolean;
}

/** Résultat aligné sur la surface client (`result.success` / `result.message`). */
export interface EnvoiResult {
  readonly success: boolean;
  readonly message: string;
}

/** Même limiteur que bon de commande/avis (anti-abus d'envoi), clé dédiée par artisan. */
function rateLimitKey(artisanId: number): string {
  return `facture:${artisanId}`;
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
 * Construit le sujet + corps HTML de l'email facture (pur, testable). Parité fonctionnelle avec le
 * template legacy `generateFactureEmailContent` (en-tête entreprise, n° facture, montant TTC,
 * échéance) ; le `customMessage` éventuel est ajouté en bas (échappé).
 */
export function buildFactureEmail(params: {
  artisanName: string;
  clientName: string;
  numero: string;
  objet?: string | null;
  totalTTC: string;
  dateEcheance?: string | null;
  customMessage?: string | null;
}): { subject: string; body: string } {
  const { artisanName, clientName, numero, objet, totalTTC, dateEcheance, customMessage } = params;
  const subject = `Facture ${numero}${objet ? ` - ${objet}` : ""} de ${artisanName}`;
  const note = customMessage
    ? `<tr><td style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(customMessage)}</td></tr>`
    : "";
  const echeance = dateEcheance
    ? `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Échéance</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #dbeafe;">${escapeHtml(dateEcheance)}</td></tr>`
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
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint la facture <strong>${escapeHtml(numero)}</strong>${objet ? ` concernant <em>&laquo;&nbsp;${escapeHtml(objet)}&nbsp;&raquo;</em>` : ""}.</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de facture</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(numero)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Montant TTC</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:700;text-align:right;border-top:1px solid #dbeafe;">${escapeHtml(totalTTC)}</td></tr>
                ${echeance}
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${note}
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, body };
}

/*
 * Envoie une facture par email (parité legacy `factures.sendByEmail`) :
 *  - ownership : facture du tenant (sinon NotFound 404 — RLS + filtre via getById) ;
 *  - **client.email requis** (sinon Validation 400) ;
 *  - **rate-limit** anti-abus (sinon TooManyRequests 429) — AVANT tout effet de bord ;
 *  - corps email (template + customMessage) ; si `attachPdf` → PDF via `PdfPort` ({facture+lignes,
 *    artisan, client}) joint à l'email (`EmailPort`) ;
 *  - **si l'envoi réussit ET statut brouillon/validee → passe `envoyee`** (NE fait PAS régresser
 *    payee/en_retard ; NB : pas de génération d'écritures FEC ici — parité legacy `updateFacture`).
 */
export async function envoyerFactureParEmail(
  repo: IFactureRepository,
  deps: FactureMailingDeps,
  ctx: TenantContext,
  input: EnvoyerFactureEmailInput,
): Promise<EnvoiResult> {
  const facture = await repo.getById(ctx, input.factureId);
  if (!facture) throw new NotFoundError("Facture introuvable");

  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");

  const client = await deps.clientReader.getClient(ctx, facture.clientId);
  if (!client || !client.email) throw new ValidationError("Le client n'a pas d'adresse email");

  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Trop d'envois de facture par email. Réessayez dans quelques minutes.");
  }

  const artisanName = artisan.nomEntreprise || "Votre artisan";
  const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
  const totalTTC = `${round2(Number(facture.totalTTC) || 0).toFixed(2)} €`;
  const dateEcheance = facture.dateEcheance ? new Date(facture.dateEcheance).toLocaleDateString("fr-FR") : null;

  const modele = deps.modeleEmailRepo ? await deps.modeleEmailRepo.getDefaultByType(ctx, "envoi_facture") : null;
  const { subject, body } = modele
    ? buildModeleEmail(
        modele,
        {
          client_nom: clientName,
          client_prenom: client.prenom ?? "",
          numero: facture.numero,
          montant_ttc: totalTTC,
          date_echeance: dateEcheance ?? "",
          nom_entreprise: artisanName,
        },
        input.customMessage ?? null,
      )
    : buildFactureEmail({
        artisanName,
        clientName,
        numero: facture.numero,
        objet: facture.objet,
        totalTTC,
        dateEcheance,
        customMessage: input.customMessage ?? null,
      });

  const attachments = input.attachPdf
    ? await (async () => {
        const lignes = await repo.listLignes(ctx, facture.id);
        const pdf = await deps.pdf.render("facture", { facture: { ...facture, lignes }, artisan, client });
        return [{ filename: `Facture_${facture.numero}.pdf`, content: pdf, contentType: "application/pdf" }];
      })()
    : undefined;

  await deps.email.send({ to: client.email, subject, body, ...(attachments ? { attachments } : {}) });

  /** Envoi réussi (pas d'exception) : passage `envoyee` depuis brouillon/validee uniquement. */
  if (facture.statut === "brouillon" || facture.statut === "validee") {
    await repo.setStatut(ctx, facture.id, "envoyee");
  }

  const label = facture.typeDocument === "avoir" ? "Avoir" : "Facture";
  return { success: true, message: `${label} ${facture.numero} envoyé(e) à ${client.email}` };
}
