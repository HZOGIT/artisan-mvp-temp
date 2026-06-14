import type { TenantContext } from "../../../shared/tenant";
import type { Badge, BadgeTechnicien, CreateBadgeInput, ObjectifTechnicien, UpdateBadgeInput } from "../domain/badge";
import type { ClassementEntry, PeriodeClassement } from "../domain/classement";

// Port du repository badges. Chaque méthode exige le TenantContext (scope tenant + RLS).
// Deux niveaux d'isolation :
//  - `badges` possède un `artisanId` → RLS + filtre explicite ;
//  - `badges_techniciens` n'en a pas → scope via l'appartenance du technicien (et du
//    badge) au tenant. Toute attribution/lecture sur un technicien d'un autre artisan
//    doit échouer (null) — anti-IDOR.
export interface IBadgeRepository {
  list(ctx: TenantContext): Promise<Badge[]>;
  getById(ctx: TenantContext, id: number): Promise<Badge | null>;
  create(ctx: TenantContext, input: CreateBadgeInput): Promise<Badge>;
  // null si le badge n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateBadgeInput): Promise<Badge | null>;
  // false si le badge n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Badges attribués à un technicien — [] si le technicien n'appartient pas au tenant.
  listBadgesTechnicien(ctx: TenantContext, technicienId: number): Promise<BadgeTechnicien[]>;
  // Objectifs mensuels d'un technicien pour une année (tri par `mois` ASC) — [] si le technicien
  // n'appartient pas au tenant (anti-IDOR, données salarié). Parité legacy `getObjectifsTechnicien`.
  listObjectifsTechnicien(ctx: TenantContext, technicienId: number, annee: number): Promise<ObjectifTechnicien[]>;
  // Attribue un badge à un technicien — null si technicien OU badge hors tenant.
  // Idempotent : une attribution déjà existante (même technicien+badge) est renvoyée telle quelle.
  attribuer(
    ctx: TenantContext,
    technicienId: number,
    badgeId: number,
    valeurAtteinte?: number | null,
  ): Promise<BadgeTechnicien | null>;

  // Classement des techniciens du tenant pour une période (lecture, ordre par rang).
  // Scopé artisanId (RLS + filtre) → ne renvoie jamais le classement d'un autre tenant.
  getClassement(ctx: TenantContext, periode: PeriodeClassement): Promise<ClassementEntry[]>;

  // Recalcule (et persiste) le classement de la période courante à partir des
  // interventions terminées + CA des factures payées du tenant, puis le renvoie.
  // Tout scopé artisanId (RLS + filtre). Idempotent (purge avant insert).
  recalculerClassement(ctx: TenantContext, periode: PeriodeClassement): Promise<ClassementEntry[]>;

  // Vérifie les seuils (interventions terminées, avis positifs) pour un technicien et
  // attribue les badges actifs du tenant dont le seuil est atteint. Renvoie les badges
  // concernés (attribution idempotente). `null` si le technicien n'appartient pas au
  // tenant (anti-IDOR). Tout scopé artisanId + RLS.
  verifierEtAttribuerBadges(ctx: TenantContext, technicienId: number): Promise<BadgeTechnicien[] | null>;
}
