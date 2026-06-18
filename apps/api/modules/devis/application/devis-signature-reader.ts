import type { TenantContext } from "../../../shared/tenant";

// Info minimale de signature d'un devis (lecture seule) pour `getDevisNonSignes` — sans migrer tout
// le domaine signature (sensible). `signatures_devis` n'a pas d'artisanId : l'appelant ne lit que
// pour des devis DÉJÀ confirmés appartenir au tenant (anti-IDOR par le parent).
export interface DevisSignatureInfo {
  readonly id: number;
  readonly token: string;
  readonly createdAt: Date;
}

export interface DevisSignatureReader {
  getByDevisId(ctx: TenantContext, devisId: number): Promise<DevisSignatureInfo | null>;
}
