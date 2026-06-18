import type { RouterInputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `clients-import` (import Excel/CSV de clients). Parsing/validation des lignes
// PURS et testables ; la lecture/écriture XLSX (effets) reste en UI. 0 React/tRPC.

export type ImportFromExcelInput = RouterInputs["clients"]["importFromExcel"];
export type ImportClient = ImportFromExcelInput["clients"][number];

export type ClientPreview = ImportClient & { status: "valid" | "error"; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /[\d\s\-+()]{9,}/;
export function isValidEmail(email: string): boolean { return EMAIL_RE.test(email); }
export function isValidPhone(phone: string): boolean { return PHONE_RE.test(phone); }

const str = (v: unknown): string => String(v ?? "").trim();
const opt = (v: unknown): string | undefined => str(v) || undefined;

// Mappe + valide une ligne du tableur (en-têtes FR ou techniques) → aperçu client. PUR.
export function rowToPreview(row: Record<string, unknown>): ClientPreview {
  const c: ClientPreview = {
    nom: str(row.nom ?? row.Nom),
    prenom: opt(row.prenom ?? row["Prénom"]),
    email: opt(row.email ?? row.Email),
    telephone: opt(row.telephone ?? row["Téléphone"]),
    adresse: opt(row.adresse ?? row.Adresse),
    codePostal: opt(row.codePostal ?? row["Code Postal"]),
    ville: opt(row.ville ?? row.Ville),
    notes: opt(row.notes ?? row.Notes),
    status: "valid",
  };
  if (!c.nom) { c.status = "error"; c.error = "errNom"; }
  else if (c.email && !isValidEmail(c.email)) { c.status = "error"; c.error = "errEmail"; }
  else if (c.telephone && !isValidPhone(c.telephone)) { c.status = "error"; c.error = "errTelephone"; }
  return c;
}

// Parse un tableau de lignes → aperçus (lignes sans nom filtrées). PUR.
export function parseRows(rows: readonly Record<string, unknown>[]): ClientPreview[] {
  return rows.map(rowToPreview).filter((c) => c.nom);
}

export function validCount(preview: readonly ClientPreview[]): number { return preview.filter((c) => c.status === "valid").length; }
export function errorCount(preview: readonly ClientPreview[]): number { return preview.filter((c) => c.status === "error").length; }

// Payload d'import : clients valides débarrassés de status/error. PUR.
export function toImportPayload(preview: readonly ClientPreview[]): ImportFromExcelInput {
  const clients = preview.filter((c) => c.status === "valid").map(({ status, error, ...client }) => client);
  return { clients };
}

// Modèle de fichier (1 ligne d'exemple). PUR.
export const TEMPLATE_ROW = {
  nom: "Dupont", prenom: "Jean", email: "jean.dupont@email.fr", telephone: "06 12 34 56 78",
  adresse: "25 Avenue des Champs-Élysées", codePostal: "75008", ville: "Paris", notes: "Client VIP",
};
