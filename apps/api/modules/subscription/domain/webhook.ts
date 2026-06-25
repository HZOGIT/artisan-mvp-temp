/** Échappement HTML minimal. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Gabarit HTML uniforme des emails d'abonnement. Fonction PURE. */
export function subscriptionEmail(input: { title: string; body: string; ctaLabel: string; ctaUrl: string }): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#2563eb;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escapeHtml(input.title)}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(input.body)}</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${input.ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(input.ctaLabel)} →</a>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
