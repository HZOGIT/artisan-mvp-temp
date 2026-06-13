import type { TenantContext } from "../../../shared/tenant";
import type {
  Facture,
  FactureLigne,
  FactureStatut,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
} from "../domain/facture";

// Port du repository factures. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `factures` possède un `artisanId` → double cloisonnement RLS + filtre. Les `factures_lignes`
// (SANS artisanId) sont scopées via la facture parente du tenant. ⚠️ Domaine financier CRITIQUE :
// totaux dérivés des lignes (jamais fournis par le client), numérotation serveur (`nextNumero`),
// et les invariants sensibles (TVA dérivée, **immutabilité post-émission**, transitions de
// statut, paiement, avoir, FEC) sont portés par les use-cases (étapes ultérieures), pas le CRUD.
export interface IFactureRepository {
  list(ctx: TenantContext): Promise<Facture[]>;
  // null si la facture n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Facture | null>;
  create(ctx: TenantContext, input: CreateFactureInput): Promise<Facture>;
  // null si la facture n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateFactureInput): Promise<Facture | null>;
  // false si la facture n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Définit le statut (transition pilotée par le use-case workflow) — null hors tenant.
  setStatut(ctx: TenantContext, id: number, statut: FactureStatut): Promise<Facture | null>;
  // Prochain numéro de facture, scopé tenant, généré serveur (parité `getNextFactureNumber`).
  nextNumero(ctx: TenantContext): Promise<string>;
  // true si le client référencé appartient au tenant (anti-IDOR-FK).
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  // true si le devis référencé appartient au tenant (anti-IDOR-FK sur le lien devis→facture).
  ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean>;

  // Lignes d'une facture — [] si la facture n'appartient pas au tenant.
  listLignes(ctx: TenantContext, factureId: number): Promise<FactureLigne[]>;
  // Ajoute une ligne (montants recalculés) — null si la facture n'appartient pas au tenant.
  addLigne(ctx: TenantContext, factureId: number, input: CreateFactureLigneInput): Promise<FactureLigne | null>;
  // Modifie une ligne (montants recalculés) — null si la ligne ne relève pas d'une facture du tenant.
  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateFactureLigneInput): Promise<FactureLigne | null>;
  // false si la ligne ne relève pas d'une facture du tenant.
  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean>;
}
