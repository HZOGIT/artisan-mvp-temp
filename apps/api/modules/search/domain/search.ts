/*
 * Recherche globale : entrées cross-domaine (client/devis/facture/intervention/fournisseur) projetées
 * vers une forme uniforme {id, type, title, subtitle, url} pour la palette de recherche du front.
 */
export interface SearchResult {
  readonly id: number;
  readonly type: "client" | "devis" | "facture" | "intervention" | "fournisseur";
  readonly title: string;
  readonly subtitle: string;
  readonly url: string;
}

/** Lignes brutes (projections minimales) renvoyées par le reader, par type d'entité. */
export interface SearchMatches {
  readonly clients: ReadonlyArray<{ id: number; nom: string; prenom: string | null; email: string | null; telephone: string | null; ville: string | null }>;
  readonly devis: ReadonlyArray<{ id: number; numero: string; objet: string | null; statut: string | null; totalTTC: string | null }>;
  readonly factures: ReadonlyArray<{ id: number; numero: string | null; objet: string | null; statut: string | null; totalTTC: string | null }>;
  readonly interventions: ReadonlyArray<{ id: number; titre: string; statut: string | null; dateDebut: Date | string | null }>;
  readonly fournisseurs: ReadonlyArray<{ id: number; nom: string; email: string | null; telephone: string | null }>;
}

/** Formatage monétaire (parité legacy : en-US, 2 décimales, suffixe « € »). PURE. */
export function fmtEur(v: unknown): string {
  return `${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Formatage date JJ/MM/AAAA (parité legacy ; chaîne vide si absente). PURE. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

/*
 * Construit la liste de résultats uniformes à partir des lignes brutes. Ordre = clients, devis,
 * factures, interventions, fournisseurs (parité legacy). Fonction PURE.
 */
export function buildSearchResults(m: SearchMatches): SearchResult[] {
  const out: SearchResult[] = [];
  for (const r of m.clients) out.push({ id: r.id, type: "client", title: `${r.prenom || ""} ${r.nom}`.trim(), subtitle: r.email || r.telephone || r.ville || "", url: `/clients/${r.id}` });
  for (const r of m.devis) out.push({ id: r.id, type: "devis", title: `${r.numero}${r.objet ? " — " + r.objet : ""}`, subtitle: `${r.statut || ""} — ${fmtEur(r.totalTTC)}`, url: `/devis/${r.id}` });
  for (const r of m.factures) out.push({ id: r.id, type: "facture", title: `${r.numero}${r.objet ? " — " + r.objet : ""}`, subtitle: `${r.statut || ""} — ${fmtEur(r.totalTTC)}`, url: `/factures/${r.id}` });
  for (const r of m.interventions) out.push({ id: r.id, type: "intervention", title: r.titre, subtitle: `${r.statut || ""} — ${fmtDate(r.dateDebut)}`, url: `/interventions/${r.id}` });
  for (const r of m.fournisseurs) out.push({ id: r.id, type: "fournisseur", title: r.nom, subtitle: r.email || r.telephone || "", url: `/fournisseurs/${r.id}` });
  return out;
}
