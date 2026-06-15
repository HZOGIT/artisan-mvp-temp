// Domaine SIGNATURE (signature électronique de devis). SENSIBLE : valeur probante (IP/UA capturés,
// horodatage), immutabilité post-signature et anti-rejeu du token. `signatures_devis` n'a PAS
// d'artisanId → HORS RLS : l'anti-IDOR passe par l'appartenance du DEVIS parent au tenant (vérifiée
// par le use-case via une lecture RLS du devis avant tout accès à la signature).
import { randomUUID } from "crypto";

export type SignatureStatut = "en_attente" | "accepte" | "refuse";

// Reflet (lecture) d'une ligne `signatures_devis`. `signatureData` (image base64) lourde → exposée
// telle quelle au portail de signature, mais pas nécessaire pour les vues artisan.
export interface Signature {
  readonly id: number;
  readonly devisId: number;
  readonly token: string;
  readonly statut: SignatureStatut;
  readonly signatureData: string | null;
  readonly signataireName: string | null;
  readonly signataireEmail: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly motifRefus: string | null;
  readonly signedAt: Date | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

// Entrée de création d'une demande de signature (token + échéance générés serveur).
export interface NewSignature {
  readonly devisId: number;
  readonly token: string;
  readonly expiresAt: Date;
}

// Jeton de signature : 64 caractères hex (parité legacy = 2× UUID sans tirets, tronqué). C'est la
// **capacité** d'accès au portail public → imprévisible (RNG crypto). Borne colonne `token` = 64.
export function generateSignatureToken(): string {
  return (randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")).slice(0, 64);
}

// Échéance du lien de signature : `now` + `days` (30 j par défaut, parité legacy).
export function computeSignatureExpiry(now: Date, days = 30): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d;
}

// Échappement HTML minimal (parité legacy `safeHtml`) avant injection dans le gabarit d'email.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Montant en euros formaté FR (parité legacy `Intl.NumberFormat('fr-FR', currency EUR)`).
export function formatEuro(montant: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number.isFinite(montant) ? montant : 0,
  );
}

// Données nécessaires à la composition de l'email « devis à signer » (portées au use-case).
export interface SignatureLinkEmailInput {
  readonly artisanName: string;
  readonly clientName: string;
  readonly devisNumero: string;
  readonly devisObjet: string | null;
  readonly totalTTC: number;
  readonly signatureUrl: string;
}

// Email HTML envoyé au client avec le lien de signature (gabarit fidèle au legacy). Sujet + corps.
export function buildSignatureLinkEmail(input: SignatureLinkEmailInput): { subject: string; body: string } {
  const artisanName = input.artisanName || "Votre artisan";
  const clientName = input.clientName || "Client";
  const totalTTC = formatEuro(input.totalTTC);
  const subject = `Devis ${input.devisNumero} à signer - ${artisanName}`;
  const objetFragment = input.devisObjet ? ` pour <em>${escapeHtml(input.devisObjet)}</em>` : "";
  const body = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">${escapeHtml(artisanName)}</h1>
</td></tr>
<tr><td style="padding:36px 40px 16px 40px;">
<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Bonjour ${escapeHtml(clientName)},</p>
<p style="margin:0 0 24px 0;font-size:15px;color:#374151;">Vous avez reçu le devis <strong>${escapeHtml(input.devisNumero)}</strong>${objetFragment} d'un montant de <strong>${totalTTC}</strong>.</p>
<p style="margin:0 0 24px 0;font-size:15px;color:#374151;">Cliquez sur le bouton ci-dessous pour consulter le devis et le signer électroniquement :</p>
</td></tr>
<tr><td style="padding:0 40px 28px 40px;text-align:center;">
<a href="${input.signatureUrl}" style="display:inline-block;background-color:#1e40af;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:600;">Consulter et signer le devis</a>
</td></tr>
<tr><td style="padding:0 40px 36px 40px;">
<p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">Ce lien est valide pendant 30 jours.</p>
<p style="margin:0;font-size:13px;color:#9ca3af;">Si le bouton ne fonctionne pas, copiez ce lien : ${input.signatureUrl}</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0;font-size:12px;color:#9ca3af;">Ce message a été envoyé automatiquement depuis Operioz</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, body };
}
