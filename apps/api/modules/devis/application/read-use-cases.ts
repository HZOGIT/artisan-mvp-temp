import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientReader, ClientInfo } from "../../../shared/readers/contact-readers";
import type { IDevisRepository } from "./devis-repository";
import type { Devis, DevisLigne } from "../domain/devis";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getDevis` sur une ressource d'un autre tenant → le repo
 * renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant). Les lignes sont scopées
 * via le devis parent (→ [] si le devis n'appartient pas au tenant).
 */

export function listDevis(repo: IDevisRepository, ctx: TenantContext): Promise<Devis[]> {
  return repo.list(ctx);
}

export async function getDevis(repo: IDevisRepository, ctx: TenantContext, id: number): Promise<Devis> {
  const devis = await repo.getById(ctx, id);
  if (!devis) throw new NotFoundError("Devis introuvable");
  return devis;
}

export function listLignesDevis(repo: IDevisRepository, ctx: TenantContext, devisId: number): Promise<DevisLigne[]> {
  return repo.listLignes(ctx, devisId);
}

/*
 * Devis enrichi pour l'affichage détail (parité legacy `devis.getById` qui renvoie
 * `{ ...devis, lignes, client }` — consommé par `DevisDetail` côté client ; la signature est lue
 * séparément via `trpc.signature.*`). `client` peut être null (client supprimé). 404 hors tenant.
 */
export type DevisDetail = Devis & { readonly lignes: DevisLigne[]; readonly client: ClientInfo | null };

export async function getDevisDetail(
  repo: IDevisRepository,
  clientReader: ClientReader,
  ctx: TenantContext,
  id: number,
): Promise<DevisDetail> {
  const devis = await repo.getById(ctx, id);
  if (!devis) throw new NotFoundError("Devis introuvable");
  const [lignes, client] = await Promise.all([repo.listLignes(ctx, id), clientReader.getClient(ctx, devis.clientId)]);
  return { ...devis, lignes, client };
}
