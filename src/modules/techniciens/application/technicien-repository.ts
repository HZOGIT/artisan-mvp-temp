import type { TenantContext } from "../../../shared/tenant";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";
import type { Position, EnregistrerPositionInput } from "../domain/position";
import type { UtilisateurLiable } from "../domain/utilisateur-liable";
import type { HabilitationTechnicien, AjouterHabilitationInput } from "../domain/habilitation";
import type { TechnicienStats } from "../domain/stats";

// Port du repository techniciens. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `techniciens` possède un `artisanId` → double cloisonnement RLS + filtre.
// Les sous-ressources (positions/disponibilités/objectifs — tables SANS artisanId)
// seront ajoutées aux étapes suivantes, scopées via l'appartenance du technicien (anti-IDOR
// géoloc historique).
export interface ITechnicienRepository {
  list(ctx: TenantContext): Promise<Technicien[]>;
  getById(ctx: TenantContext, id: number): Promise<Technicien | null>;
  create(ctx: TenantContext, input: CreateTechnicienInput): Promise<Technicien>;
  // null si le technicien n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateTechnicienInput): Promise<Technicien | null>;
  // false si le technicien n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Disponibilités hebdomadaires d'un technicien — [] si le technicien n'appartient pas
  // au tenant (anti-IDOR, lecture sans oracle ; la table n'a pas d'artisanId).
  listDisponibilites(ctx: TenantContext, technicienId: number): Promise<Disponibilite[]>;
  // Définit (upsert par jourSemaine) un créneau de disponibilité — null si technicien hors tenant.
  setDisponibilite(ctx: TenantContext, technicienId: number, input: SetDisponibiliteInput): Promise<Disponibilite | null>;

  // Dernière position GPS connue d'un technicien — null si technicien hors tenant ou aucune
  // position (lecture sans oracle ; la table n'a pas d'artisanId → anti-IDOR géoloc).
  getDernierePosition(ctx: TenantContext, technicienId: number): Promise<Position | null>;
  // Enregistre une position GPS — null si le technicien n'appartient pas au tenant.
  enregistrerPosition(ctx: TenantContext, technicienId: number, input: EnregistrerPositionInput): Promise<Position | null>;

  // Utilisateurs du tenant liables à une fiche technicien (propriétaire + collaborateurs).
  // ⚠️ `users` hors RLS tenant → filtre artisanId EXPLICITE (jamais d'autre tenant).
  getUsersLiables(ctx: TenantContext): Promise<UtilisateurLiable[]>;

  // Habilitations BTP d'un technicien (OPE-162, données salarié) — [] si le technicien
  // n'appartient pas au tenant (anti-IDOR). Tri par dateExpiration (échéances d'abord).
  listHabilitations(ctx: TenantContext, technicienId: number): Promise<HabilitationTechnicien[]>;
  // Ajoute une habilitation — null si le technicien n'appartient pas au tenant.
  ajouterHabilitation(
    ctx: TenantContext,
    technicienId: number,
    input: AjouterHabilitationInput,
  ): Promise<HabilitationTechnicien | null>;
  // Supprime une habilitation (scopée au technicien owné) — false si technicien hors tenant
  // ou habilitation introuvable.
  supprimerHabilitation(ctx: TenantContext, technicienId: number, id: number): Promise<boolean>;

  // Comptes d'interventions par statut pour un technicien (dérivé du domaine interventions, agrégat
  // SQL scopé artisanId+technicienId). null si le technicien n'appartient pas au tenant (anti-IDOR).
  statsTechnicien(ctx: TenantContext, technicienId: number): Promise<TechnicienStats | null>;
}
