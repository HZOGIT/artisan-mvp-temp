import type { TenantContext } from "../../../shared/tenant";

// Référence de la facture créée par conversion d'un devis (le client navigue vers `/factures/{id}`).
export interface FactureCreeeRef {
  readonly id: number;
  readonly numero: string;
}

// Port cross-domaine : convertit un devis (accepté) en facture brouillon. L'adapter (infra) compose
// le use-case de conversion du domaine factures (numéro serveur, lignes copiées, anti-doublon).
// ⚠️ Invariants portés par le use-case factures : devis du tenant (404), **statut `accepte`** requis
// (Conflict), **anti-doublon** de conversion (Conflict).
export interface DevisToFactureConverter {
  convertir(ctx: TenantContext, devisId: number): Promise<FactureCreeeRef>;
}
