function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Remplace `{{cle}}` dans un template HTML par les valeurs échappées — clé inconnue → "".
 * Utilisé pour le corps (HTML) d'un email.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => escapeHtml(vars[key.trim()] ?? ""));
}

/**
 * Remplace `{{cle}}` dans un template SUJET (texte brut) sans échappement HTML.
 * Utilisé pour le sujet d'un email.
 */
export function renderSubject(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? "");
}

/**
 * Construit un `{subject, body}` depuis un modèle personnalisé avec substitution de variables.
 * Si `customMessage` fourni, il est ajouté en bas du corps (échappé).
 */
export function buildModeleEmail(
  modele: { sujet: string; contenu: string },
  vars: Record<string, string>,
  customMessage?: string | null,
): { subject: string; body: string } {
  let body = renderTemplate(modele.contenu, vars);
  if (customMessage) {
    body += `<p style="font-style:italic;color:#6b7280;">${escapeHtml(customMessage)}</p>`;
  }
  return { subject: renderSubject(modele.sujet, vars), body };
}
