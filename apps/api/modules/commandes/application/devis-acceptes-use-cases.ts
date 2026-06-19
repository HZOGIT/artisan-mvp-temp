import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "../../devis/application/devis-repository";
import type { IClientRepository } from "../../clients/application/client-repository";

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
  clientRepo: IClientRepository,
  ctx: TenantContext,
): Promise<DevisAccepte[]> {
  const acceptes = (await devisRepo.list(ctx)).filter((d) => d.statut === "accepte");
  return Promise.all(
    acceptes.map(async (d) => {
      /** Best-effort : "Client" si le client n'est pas (ou plus) accessible dans le tenant. */
      let clientNom = "Client";
      const c = await clientRepo.getById(ctx, d.clientId);
      if (c) clientNom = c.nom + (c.prenom ? " " + c.prenom : "");
      return {
        id: d.id,
        numero: d.numero,
        objet: d.objet ?? "",
        clientNom,
        totalTTC: Number(d.totalTTC ?? "0") || 0,
        dateDevis: d.dateDevis ? d.dateDevis.toISOString() : "",
      };
    }),
  );
}
