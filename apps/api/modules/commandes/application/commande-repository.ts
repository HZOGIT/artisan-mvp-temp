import type { TenantContext } from "../../../shared/tenant";
import type {
  Commande,
  LigneCommande,
  CreateCommandeInput,
  UpdateCommandeInput,
  CommandeStatut,
  CommandeStatutFacturation,
} from "../domain/commande";

/*
 * Port du repository commandes fournisseurs. Chaque méthode exige le TenantContext (scope
 * tenant + RLS). `commandes_fournisseurs` possède un `artisanId` → double cloisonnement
 * RLS + filtre. Les `lignes_commandes_fournisseurs` (SANS artisanId) sont scopées via
 * l'appartenance de la commande au tenant. ⚠️ Domaine sensible : les totaux sont calculés
 * côté repo/use-case (jamais fournis par le client), la réception (quantiteRecue) et les
 * transitions de statut sont des étapes ultérieures avec leurs invariants.
 */
export interface ICommandeRepository {
  list(ctx: TenantContext): Promise<Commande[]>;
  getById(ctx: TenantContext, id: number): Promise<Commande | null>;
  // Lignes d'une commande — [] si la commande n'appartient pas au tenant.
  listLignes(ctx: TenantContext, commandeId: number): Promise<LigneCommande[]>;
  /*
   * Crée la commande + ses lignes (totaux calculés). Le fournisseur doit appartenir au
   * tenant (null sinon).
   */
  create(ctx: TenantContext, input: CreateCommandeInput): Promise<Commande | null>;
  // null si la commande n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateCommandeInput): Promise<Commande | null>;
  // false si la commande n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * Change le statut d'une commande (+ date de livraison réelle optionnelle) — null si
   * la commande n'appartient pas au tenant.
   */
  updateStatut(
    ctx: TenantContext,
    id: number,
    statut: CommandeStatut,
    dateLivraisonReelle?: Date | null,
  ): Promise<Commande | null>;
  // Commandes du tenant en retard de livraison (échéance dépassée, non livrées/annulées).
  listEnRetard(ctx: TenantContext): Promise<Commande[]>;

  /*
   * Enregistre la réception (quantiteRecue par ligne) — n'affecte que les lignes de CETTE
   * commande (les autres ligneId sont ignorées). Recalcule le statut depuis les quantités
   * reçues (livree si tout reçu, partiellement_livree si partiel, sinon inchangé/confirmee).
   * null si la commande n'appartient pas au tenant. ⚠️ L'invariant `quantiteRecue ≤ quantite`
   * est garanti (clamp) ; la validation stricte (rejet) est portée par le use-case.
   */
  recevoir(ctx: TenantContext, commandeId: number, receptions: ReceptionLigne[]): Promise<Commande | null>;

  /*
   * Définit le statut de facturation (+ lien dépense optionnel). Le lien n'est posé que si
   * la dépense appartient au tenant (anti-IDOR-FK) ; `a_facturer` délie. null hors tenant.
   */
  setStatutFacturation(
    ctx: TenantContext,
    id: number,
    statutFacturation: CommandeStatutFacturation,
    depenseId?: number | null,
  ): Promise<Commande | null>;
}

export interface ReceptionLigne {
  readonly ligneId: number;
  readonly quantiteRecue: number;
}
