/** Email de sécurité : notification de modification de l'IBAN de facturation. */
export function ibanChangedEmail(): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#dc2626;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">⚠ Modification de votre IBAN</h1>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">Bonjour,</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
            L'IBAN de facturation de votre compte Operioz vient d'être modifié. Les futurs virements de vos clients seront dirigés vers le nouveau compte bancaire.
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
            Si vous n'êtes pas à l'origine de cette modification, connectez-vous immédiatement à votre compte et contactez notre support.
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
