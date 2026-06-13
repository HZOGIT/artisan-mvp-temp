import type { TenantContext } from "../../../shared/tenant";
import type {
  Devis,
  DevisLigne,
  CreateDevisInput,
  UpdateDevisInput,
  CreateDevisLigneInput,
  UpdateDevisLigneInput,
} from "../domain/devis";

// Port du repository devis. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `devis` possède un `artisanId` → double cloisonnement RLS + filtre. Les `devis_lignes` (SANS
// artisanId) sont scopées via l'appartenance du devis parent au tenant. ⚠️ Domaine financier :
// les totaux (totalHT/TVA/TTC) sont calculés côté repo/use-case (jamais fournis par le client),
// la numérotation est générée serveur (`nextNumero`), et les invariants sensibles (TVA dérivée,
// **immutabilité post-signature**, transitions de statut, conversion en facture) sont portés par
// les use-cases (étapes ultérieures), pas par le CRUD.
export interface IDevisRepository {
  list(ctx: TenantContext): Promise<Devis[]>;
  // null si le devis n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Devis | null>;
  create(ctx: TenantContext, input: CreateDevisInput): Promise<Devis>;
  // null si le devis n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateDevisInput): Promise<Devis | null>;
  // false si le devis n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Prochain numéro de devis, scopé tenant, généré serveur (jamais fourni par le client) →
  // intégrité de la numérotation commerciale (parité legacy `getNextDevisNumber`).
  nextNumero(ctx: TenantContext): Promise<string>;
  // true si le client référencé appartient au tenant (anti-IDOR-FK avant rattachement).
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;

  // Lignes d'un devis — [] si le devis n'appartient pas au tenant.
  listLignes(ctx: TenantContext, devisId: number): Promise<DevisLigne[]>;
  // Ajoute une ligne (montants recalculés) — null si le devis n'appartient pas au tenant.
  addLigne(ctx: TenantContext, devisId: number, input: CreateDevisLigneInput): Promise<DevisLigne | null>;
  // Modifie une ligne (montants recalculés) — null si la ligne ne relève pas d'un devis du tenant.
  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateDevisLigneInput): Promise<DevisLigne | null>;
  // false si la ligne ne relève pas d'un devis du tenant.
  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean>;
}
