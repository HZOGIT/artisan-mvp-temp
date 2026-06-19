/*
 * Domaine de l'espace client (portail) — accès PUBLIC par token (capacité), pas de cookie tenant.
 * Le token résout un accès `client_portal_access` (actif + non expiré) → {clientId, artisanId} ; les
 * lectures du client repassent sous le scope du tenant résolu (RLS). Slice 1 : cycle de vie de l'accès
 * (génération/statut/désactivation, côté artisan) + identité (verifyAccess/getClientInfo, public).
 */

export interface PortalAccessRef {
  readonly id: number;
  readonly clientId: number;
  readonly artisanId: number;
}

export interface ClientPortalInfo {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
}

export interface ArtisanPortalInfo {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly telephone: string | null;
  readonly email: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly siret: string | null;
  readonly logo: string | null;
}

export interface PortalAccessStatus {
  readonly actif: boolean;
  readonly token: string;
  readonly dateExpiration: Date;
  readonly lastAccessAt: Date | null;
  readonly createdAt: Date;
}

// Durée de validité d'un lien d'accès (parité legacy : 90 jours).
export const PORTAL_ACCESS_TTL_DAYS = 90;

export function computeExpiry(now: Date, ttlDays: number = PORTAL_ACCESS_TTL_DAYS): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + ttlDays);
  return d;
}

export function buildPortalUrl(origin: string, token: string): string {
  return `${origin}/portail/${token}`;
}

export function clientNomComplet(prenom: string | null, nom: string): string {
  return `${prenom || ""} ${nom}`.trim();
}

// Échappe le HTML inséré dans l'email d'accès (anti-injection). Parité legacy `safeHtml`.
export function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Corps HTML de l'email « Accès à votre espace client » (parité legacy, structure conservée).
export function buildAccessEmailBody(artisanName: string, clientName: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${safeHtml(artisanName)}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${safeHtml(clientName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Vous pouvez désormais consulter vos devis, factures et interventions depuis votre espace client en ligne.</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;">Accéder à mon espace client</a>
        </td></tr>
        <tr><td style="padding:0 40px 36px 40px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">Ce lien est valable 90 jours. Si vous ne pouvez pas cliquer sur le bouton, copiez ce lien dans votre navigateur :</p>
          <p style="margin:0;font-size:13px;color:#2563eb;word-break:break-all;">${portalUrl}</p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Ce message a été envoyé automatiquement depuis Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
