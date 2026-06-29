import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "../../devis/application/devis-repository";

/*
 * Devis acceptés du tenant, enrichis du nom client (parité legacy `listDevisAcceptes`). Sert de base
 * à la création d'une commande fournisseur. ⚠️ Cross-domaine : devis (filtre `accepte`) + clients (nom).
 */
export interface DevisAccepte {
  readonly id: number;
  readonly numero: string;
  readonly objet: string;
  readonly clientNom: string;
  readonly totalTTC: number;
  /** ISO */
  readonly dateDevis: string;
}

export async function listerDevisAcceptes(
  devisRepo: IDevisRepository,
  ctx: TenantContext,
): Promise<DevisAccepte[]> {
  const rows = await devisRepo.listAcceptesAvecClient(ctx);
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    objet: r.objet ?? "",
    clientNom: r.clientNom ? r.clientNom + (r.clientPrenom ? " " + r.clientPrenom : "") : "Client",
    totalTTC: Number(r.totalTTC ?? "0") || 0,
    dateDevis: r.dateDevis ? r.dateDevis.toISOString() : "",
  }));
}
