import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  CreateModeleDevisInput,
  CreateModeleDevisLigneInput,
  ModeleDevis,
  ModeleDevisLigne,
  UpdateModeleDevisInput,
} from "../domain/modele-devis";

/*
 * Port du repository modeles-devis (agrégat en-tête + lignes). Chaque méthode exige le
 * TenantContext (scope tenant + RLS). `modeles_devis` possède un `artisanId` (double cloisonnement
 * RLS + filtre) ; `modeles_devis_lignes` est scopée via le parent `modeleId` (jamais d'accès direct
 * sans vérifier l'ownership du modèle).
 */
export interface IModeleDevisRepository {
  /** Liste « légère » : en-têtes du tenant (les lignes ne sont pas chargées ici — voir getById). */
  list(ctx: TenantContext): Promise<ModeleDevis[]>;
  /** Agrégat complet (en-tête + lignes ordonnées) ; null si le modèle n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<ModeleDevis | null>;
  create(ctx: TenantContext, input: CreateModeleDevisInput): Promise<ModeleDevis>;
  /** null si le modèle n'appartient pas au tenant. Si `input.lignes` est fourni → remplacement complet. */
  update(ctx: TenantContext, id: number, input: UpdateModeleDevisInput): Promise<ModeleDevis | null>;
  /** false si le modèle n'appartient pas au tenant (supprime aussi ses lignes). */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  /*
   * Ajoute UNE ligne à un modèle possédé (sans toucher aux autres lignes — ≠ `update` qui remplace
   * l'ensemble). null si le modèle n'appartient pas au tenant (anti-IDOR via le parent).
   */
  addLigne(ctx: TenantContext, modeleId: number, input: CreateModeleDevisLigneInput): Promise<ModeleDevisLigne | null>;
  withDb(db: DbClient): IModeleDevisRepository;
}
