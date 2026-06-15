// Domaine de l'import ERP (parité legacy `importErp`). Import « léger » par lot : des lignes CSV/Excel
// (déjà parsées côté client en objets) + un mapping {colonneCSV → champ Operioz}. On crée des
// clients/devis/factures « légers » (montant TTC brut, sans lignes ni ventilation TVA — c'est un import
// de reprise de données, pas une émission). Numéro généré serveur. Idempotence best-effort (dedup email
// pour les clients ; lookup client par nom pour devis/factures).

export type ImportRow = Record<string, unknown>;
export type ImportMapping = Record<string, string>;

// Compteurs d'un import (parité legacy).
export interface ImportResult {
  imported: number;
  errors: number;
  duplicates: number;
  errorDetails: string[];
}

export function emptyResult(): ImportResult {
  return { imported: 0, errors: 0, duplicates: 0, errorDetails: [] };
}

// Récupère la valeur d'un champ Operioz dans une ligne via le mapping (parité legacy `pickField`).
// Cherche la colonne CSV qui pointe vers `field`, lit la valeur, la trim ; undefined si absente/vide.
export function pickField(row: ImportRow, mapping: ImportMapping, field: string): string | undefined {
  const csvCol = Object.keys(mapping).find((k) => mapping[k] === field);
  if (!csvCol) return undefined;
  const v = row[csvCol];
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim();
}

// Client existant minimal (pour dedup/lookup).
export interface ClientRef {
  readonly id: number;
  readonly nom: string | null;
  readonly prenom: string | null;
  readonly email: string | null;
}

// Trouve un client par nom complet (parité legacy `findClientByName`) : compare "prenom nom",
// "nom prenom" et le nom seul, en normalisé (minuscule + trim). undefined si aucun match.
export function findClientByName(clients: readonly ClientRef[], full: string): ClientRef | undefined {
  const norm = full.toLowerCase().trim();
  return clients.find((c) => {
    const fn = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase().trim();
    const inv = `${c.nom || ""} ${c.prenom || ""}`.toLowerCase().trim();
    return fn === norm || inv === norm || (c.nom || "").toLowerCase() === norm;
  });
}
