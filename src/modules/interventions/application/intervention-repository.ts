import type { TenantContext } from "../../../shared/tenant";
import type {
  Intervention,
  CreateInterventionInput,
  UpdateInterventionInput,
  EquipeMembre,
  EquipeMembreArtisan,
  AjouterMembreEquipeInput,
} from "../domain/intervention";

// Nature d'une FK référencée par une intervention (toutes des tables scopées tenant).
export type InterventionRefKind = "client" | "technicien" | "devis" | "facture";

// Port du repository interventions. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `interventions` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les FK
// `clientId`/`technicienId`/`devisId`/`factureId` sont vérifiées comme appartenant au tenant
// lors des écritures (anti-IDOR-FK) via `ownsRef`.
export interface IInterventionRepository {
  list(ctx: TenantContext): Promise<Intervention[]>;
  // null si l'intervention n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Intervention | null>;
  create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention>;
  // null si l'intervention n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null>;
  // false si l'intervention n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si la ressource référencée (client/technicien/devis/facture) appartient au tenant.
  // Garde anti-IDOR-FK : interdit de lier une intervention à la ressource d'un autre tenant.
  ownsRef(ctx: TenantContext, kind: InterventionRefKind, id: number): Promise<boolean>;
  // Identifiant de la fiche technicien liée à l'utilisateur courant dans le tenant, ou null.
  // Sert au cloisonnement « un technicien ne voit que SES interventions » (minimisation RGPD).
  findTechnicienIdForUser(ctx: TenantContext): Promise<number | null>;
  // Interventions du tenant assignées à un technicien donné (scopé).
  listByTechnicien(ctx: TenantContext, technicienId: number): Promise<Intervention[]>;

  // ── Équipe d'intervention (table `interventions_techniciens`, scopée tenant) ─────────────────
  // Membres d'équipe d'une intervention (jointure technicien pour nom/prénom), triés par id de liaison.
  listEquipe(ctx: TenantContext, interventionId: number): Promise<EquipeMembre[]>;
  // Toutes les liaisons d'équipe du tenant (1 requête, anti-N+1 pour la liste/planning).
  listEquipesArtisan(ctx: TenantContext): Promise<EquipeMembreArtisan[]>;
  // Ajoute un membre (artisanId forcé). **Idempotent** : renvoie la liaison existante si
  // (intervention, technicien) est déjà présent.
  addMembreEquipe(ctx: TenantContext, input: AjouterMembreEquipeInput): Promise<EquipeMembre>;
  // Retire un membre par id de liaison (scopé tenant ; idempotent — no-op si absent/hors tenant).
  removeMembreEquipe(ctx: TenantContext, id: number): Promise<void>;
}
