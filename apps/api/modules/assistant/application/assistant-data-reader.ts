import type { TenantContext } from "../../../shared/tenant";
import type { DevisAnalyseData, TresorerieData } from "../domain/generators";

/*
 * Devis non signé (brouillon/envoyé) + client, pour suggestRelances (le seuil 7 j est appliqué côté
 * use-case). `dateDevis` sert au calcul des jours écoulés.
 */
export interface DevisNonSigneAvecClient {
  readonly numero: string;
  readonly objet: string | null;
  readonly totalTTC: string;
  readonly dateDevis: Date;
  readonly clientNom: string;
  readonly clientEmail: string | null;
}

/*
 * Accès aux données métier des générateurs IA, scopé tenant (RLS + filtre artisanId). `getDevisAnalyse`
 * renvoie `null` si le devis n'appartient pas au tenant (anti-IDOR). Les catalogues/tarifs (articles
 * artisan + bibliothèque métier) sont pré-formatés ici (logique de présentation legacy).
 */
export interface AssistantDataReader {
  listDevisNonSignes(ctx: TenantContext): Promise<DevisNonSigneAvecClient[]>;
  getCatalogue(ctx: TenantContext): Promise<string>;
  getDevisAnalyse(ctx: TenantContext, devisId: number): Promise<DevisAnalyseData | null>;
  getTresorerie(ctx: TenantContext): Promise<TresorerieData>;
}
