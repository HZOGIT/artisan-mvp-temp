import type { TenantContext } from "../../../shared/tenant";
import type { Depense, CreateDepenseInput, UpdateDepenseInput } from "../domain/depense";

// Nature d'une FK référencée par une dépense (toutes des tables scopées tenant).
export type DepenseRefKind = "chantier" | "intervention" | "client";

// Port du repository depenses. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `depenses` possède un `artisan_id` → double cloisonnement RLS + filtre. ⚠️ Les invariants
// sensibles (cohérence TVA, anti-IDOR-FK des liens chantier/intervention/client, workflow de
// remboursement) sont portés par les use-cases (étapes ultérieures), pas par le CRUD.
export interface IDepenseRepository {
  list(ctx: TenantContext): Promise<Depense[]>;
  // null si la dépense n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Depense | null>;
  create(ctx: TenantContext, input: CreateDepenseInput): Promise<Depense>;
  // null si la dépense n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateDepenseInput): Promise<Depense | null>;
  // false si la dépense n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si la ressource référencée (chantier/intervention/client) appartient au tenant.
  // Garde anti-IDOR-FK : interdit de lier une dépense à la ressource d'un autre tenant.
  ownsRef(ctx: TenantContext, kind: DepenseRefKind, id: number): Promise<boolean>;
  // Prochain numéro de dépense (format `DEP-00001`), scopé tenant, incrémenté depuis la
  // dernière dépense de l'artisan. Le numéro est généré côté serveur (jamais fourni par le
  // client) → intégrité de la numérotation comptable (parité legacy `getNextDepenseNumero`).
  nextNumero(ctx: TenantContext): Promise<string>;
  // Réalisé du mois agrégé par catégorie : SUM(montantTtc) des dépenses dont `dateDepense` est dans
  // le mois "YYYY-MM", groupé par `categorie`. Sert au read dérivé « budgets réalisés » (parité
  // legacy `calculerBudgetsRealises`). Montant rendu en string (numeric PG).
  realisesParCategorie(ctx: TenantContext, mois: string): Promise<{ categorie: string; reel: string }[]>;
}
