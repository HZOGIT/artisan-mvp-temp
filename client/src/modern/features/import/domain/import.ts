import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `import` (assistant d'import ERP CSV → clients/devis/factures). Parser CSV
// PUR (séparateur auto + quotes), auto-mapping, catalogues. Les libellés FR des catalogues vivent ici
// (rendus comme variables → non concernés par la règle i18next sur les littéraux JSX).

export type ImportKind = "clients" | "devis" | "factures";
export type FieldDef = { key: string; label: string; required?: boolean };
export type ImportResult = RouterOutputs["importErp"]["importClients"];
export type Mapping = Record<string, string>;
export type CsvRow = Record<string, string>;

export type SourceErp = {
  key: string; label: string; shortName: string; description: string;
  templates: { kind: ImportKind; href: string }[]; gradient: string; initials: string; recommended?: boolean;
};

export const SOURCES: readonly SourceErp[] = [
  { key: "ebp", label: "EBP Bâtiment", shortName: "EBP", description: "Logiciel de gestion EBP Bâtiment / Devis-Factures. Les exports clients EBP sont supportés en CSV séparé par point-virgule.", gradient: "from-blue-700 to-blue-900", initials: "E", templates: [{ kind: "clients", href: "/templates/template-ebp-clients.csv" }] },
  { key: "sage", label: "Sage 50 / 100", shortName: "Sage", description: "Sage 50 Compta, Sage 100 Gestion Commerciale. Format CSV avec guillemets.", gradient: "from-emerald-600 to-green-800", initials: "S", templates: [{ kind: "clients", href: "/templates/template-sage-clients.csv" }] },
  { key: "ciel", label: "Ciel Devis Factures", shortName: "Ciel", description: "Ciel Compta / Devis-Factures. Export CSV standard.", gradient: "from-sky-500 to-blue-600", initials: "C", templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }] },
  { key: "pennylane", label: "Pennylane", shortName: "Pennylane", description: "Logiciel de comptabilité Pennylane. Export clients/factures en CSV.", gradient: "from-violet-600 to-purple-700", initials: "P", templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }] },
  { key: "batappli", label: "Batappli", shortName: "Batappli", description: "Logiciel de gestion bâtiment Batappli.", gradient: "from-orange-500 to-amber-600", initials: "B", templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }] },
  { key: "obat", label: "Obat", shortName: "Obat", description: "Logiciel de devis-factures pour le BTP.", gradient: "from-red-600 to-rose-700", initials: "O", templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }] },
  { key: "tolteck", label: "Tolteck", shortName: "Tolteck", description: "Logiciel de devis pour artisans.", gradient: "from-teal-500 to-cyan-700", initials: "T", templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }] },
  { key: "csv", label: "Fichier CSV universel", shortName: "CSV", description: "Tout fichier CSV ou Excel exporté manuellement. Toujours disponible et le plus flexible.", gradient: "from-slate-500 to-slate-700", initials: "★", recommended: true, templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }, { kind: "devis", href: "/templates/template-universel-devis.csv" }, { kind: "factures", href: "/templates/template-universel-factures.csv" }] },
];

export const KIND_FIELDS: Record<ImportKind, { label: string; fields: FieldDef[] }> = {
  clients: { label: "Clients", fields: [
    { key: "nom", label: "Nom", required: true }, { key: "prenom", label: "Prénom" }, { key: "email", label: "Email" },
    { key: "telephone", label: "Téléphone" }, { key: "adresse", label: "Adresse" }, { key: "codePostal", label: "Code postal" },
    { key: "ville", label: "Ville" }, { key: "siret", label: "SIRET" }, { key: "notes", label: "Notes" },
  ] },
  devis: { label: "Devis", fields: [
    { key: "numeroDevis", label: "Numéro" }, { key: "dateDevis", label: "Date (YYYY-MM-DD)" }, { key: "objetDevis", label: "Objet" },
    { key: "nomClient", label: "Nom client", required: true }, { key: "totalHT", label: "Total HT" }, { key: "totalTTC", label: "Total TTC" },
    { key: "statut", label: "Statut" }, { key: "notes", label: "Notes" },
  ] },
  factures: { label: "Factures", fields: [
    { key: "numeroFacture", label: "Numéro" }, { key: "dateFacture", label: "Date (YYYY-MM-DD)" }, { key: "objetFacture", label: "Objet" },
    { key: "nomClient", label: "Nom client", required: true }, { key: "totalHT", label: "Total HT" }, { key: "totalTTC", label: "Total TTC" },
    { key: "statut", label: "Statut" }, { key: "datePaiement", label: "Date paiement" }, { key: "modePaiement", label: "Mode paiement" },
  ] },
};

// Séparateur CSV dominant (`;`, `,` ou tab) sur l'échantillon des 5 premières lignes. PUR.
export function detectSeparator(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = { ";": (sample.match(/;/g) || []).length, ",": (sample.match(/,/g) || []).length, "\t": (sample.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Découpe une ligne CSV en gérant les guillemets doublés. PUR.
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if (c === sep && !inQuotes) { out.push(cur); cur = ""; } else { cur += c; }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Parse un CSV complet → en-têtes + lignes (objets) + séparateur détecté. PUR.
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; sep: string } {
  const sep = detectSeparator(text);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [], sep };
  const headers = parseCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => {
    const cells = parseCsvLine(l, sep);
    const obj: CsvRow = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    return obj;
  });
  return { headers, rows, sep };
}

// Auto-mapping en-tête CSV → champ Operioz (par nom normalisé). PUR.
export function autoMap(csvHeaders: readonly string[], fields: readonly FieldDef[]): Mapping {
  const auto: Mapping = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const h of csvHeaders) {
    const match = fields.find((f) => norm(f.key) === norm(h));
    if (match) auto[h] = match.key;
  }
  return auto;
}

// Tous les champs obligatoires sont-ils mappés ? PUR.
export function allRequiredMapped(fields: readonly FieldDef[], mapping: Mapping): boolean {
  const mapped = new Set(Object.values(mapping));
  return fields.filter((f) => f.required).every((f) => mapped.has(f.key));
}

// Taille humaine (o / Ko / Mo). PUR.
export function bytesToHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
