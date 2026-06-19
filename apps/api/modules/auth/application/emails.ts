// Échappement HTML minimal (le `name` est interpolé dans le corps de l'email de bienvenue).
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Email de bienvenue (signup, best-effort). Lien dashboard depuis APP_URL de confiance.
export function welcomeEmail(name: string | undefined, appUrl?: string): string {
  const base = appUrl || "https://www.operioz.com";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Bienvenue sur Operioz ! 🎉</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour${name ? ` ${esc(name)}` : ""},</p>
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
            Votre compte Operioz a été créé avec succès. Vous bénéficiez de 14 jours d'essai gratuit sur toutes les fonctionnalités.
          </p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${base}/dashboard" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Accéder à mon espace →</a>
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz. Le logiciel de gestion tout-en-un pour les professionnels.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/*
 * Corps HTML des emails d'auth (parité legacy). Le `resetUrl` provient d'une source de confiance
 * (APP_URL injectée), JAMAIS de l'Origin de la requête (anti-vol de jeton).
 */
export function resetPasswordEmail(resetUrl: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2563eb;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Réinitialisation du mot de passe</h1>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">Bonjour,</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
            Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien est valable <strong>1 heure</strong>.
          </p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${resetUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
              Réinitialiser mon mot de passe →
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
            Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe restera inchangé.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
