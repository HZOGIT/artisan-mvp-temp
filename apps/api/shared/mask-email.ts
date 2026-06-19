/** `info@gmail.com` → `i**o@g**l.com` — premier + étoiles + dernier char de chaque partie. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const mask = (s: string): string =>
    s.length <= 2 ? `${s[0] ?? ""}*` : `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}`;
  return `${mask(local)}@${mask(domainName)}${tld}`;
}
