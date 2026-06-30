import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { IFournisseurRepository } from "../../fournisseurs/application/fournisseur-repository";
import type { Fournisseur } from "../../fournisseurs/domain/fournisseur";
import { round2 } from "../../../shared/money";

/*
 * Rapport de réapprovisionnement (parité legacy `getRapportCommandeFournisseur`). **Cross-domaine** :
 * croise les stocks sous le seuil (domaine stocks) avec les associations article↔fournisseur et la
 * fiche fournisseur (domaine fournisseurs, repo composé). Regroupé par fournisseur (clé 0 = stock
 * sans fournisseur lié). Scopé tenant des deux côtés (TenantContext propagé). Montants en NUMBER
 * (parité legacy `parseFloat`/calcul JS).
 */

export interface RapportLigne {
  readonly stock: {
    readonly id: number;
    readonly reference: string;
    readonly designation: string;
    readonly quantiteEnStock: string;
    readonly seuilAlerte: string;
    readonly unite: string;
    readonly prixAchat: string | null;
  };
  readonly articleFournisseur: {
    readonly referenceExterne: string | null;
    readonly prixAchat: string | null;
    readonly delaiLivraison: number | null;
  } | null;
  readonly quantiteACommander: number;
  readonly prixUnitaire: number;
  readonly montantTotal: number;
}

export interface RapportGroupe {
  readonly fournisseur: Fournisseur | null;
  readonly lignes: RapportLigne[];
  readonly totalCommande: number;
}

export async function genererRapportCommande(
  stockRepo: IStockRepository,
  fournisseurRepo: IFournisseurRepository,
  ctx: TenantContext,
): Promise<RapportGroupe[]> {
  const stocksBas = await stockRepo.listLowStock(ctx);
  if (stocksBas.length === 0) return [];

  const fournisseurs = await fournisseurRepo.list(ctx);
  const fournisseursById = new Map(fournisseurs.map((f) => [f.id, f]));

  const articleIds = stocksBas.map((s) => s.articleId).filter((id): id is number => id != null);
  const allAssocs = articleIds.length ? await fournisseurRepo.listAssociationsByArticleIds(ctx, articleIds) : [];
  const assocsByArticleId = new Map<number, typeof allAssocs>();
  for (const a of allAssocs) {
    const bucket = assocsByArticleId.get(a.articleId) ?? [];
    bucket.push(a);
    assocsByArticleId.set(a.articleId, bucket);
  }

  /** Regroupement par fournisseur (clé 0 = aucun fournisseur lié), ordre de 1ère apparition. */
  const grouped = new Map<number, { fournisseur: Fournisseur | null; lignes: RapportLigne[] }>();

  for (const stock of stocksBas) {
    const assocs = stock.articleId != null ? (assocsByArticleId.get(stock.articleId) ?? []) : [];
    const af = assocs[0] ?? null;
    const fournisseurId = af ? af.fournisseurId : 0;
    const fournisseur = fournisseurId ? (fournisseursById.get(fournisseurId) ?? null) : null;

    if (!grouped.has(fournisseurId)) grouped.set(fournisseurId, { fournisseur, lignes: [] });

    const qteEnStock = Number.parseFloat(stock.quantiteEnStock || "0");
    const seuil = Number.parseFloat(stock.seuilAlerte || "5");
    const quantiteACommander = Math.max(seuil * 2 - qteEnStock, 1);
    const prixUnitaire = Number.parseFloat(af?.prixAchat || stock.prixAchat || "0");

    const groupEntry = grouped.get(fournisseurId);
    if (!groupEntry) continue;
    groupEntry.lignes.push({
      stock: {
        id: stock.id,
        reference: stock.reference,
        designation: stock.designation,
        quantiteEnStock: stock.quantiteEnStock,
        seuilAlerte: stock.seuilAlerte,
        unite: stock.unite,
        prixAchat: stock.prixAchat,
      },
      articleFournisseur: af
        ? { referenceExterne: af.referenceExterne, prixAchat: af.prixAchat, delaiLivraison: af.delaiLivraison }
        : null,
      quantiteACommander,
      prixUnitaire,
      montantTotal: round2(quantiteACommander * prixUnitaire),
    });
  }

  return Array.from(grouped.values(), (g) => ({
    fournisseur: g.fournisseur,
    lignes: g.lignes,
    totalCommande: round2(g.lignes.reduce((sum, l) => sum + l.montantTotal, 0)),
  }));
}
