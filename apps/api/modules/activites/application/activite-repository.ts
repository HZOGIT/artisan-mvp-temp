import type { TenantContext } from "../../../shared/tenant";
import type { Activite, ActiviteEntiteType, CreateActiviteInput } from "../domain/activite";

/*
 * Port du repository « activités » (suivi commercial). Table `activites` sous RLS (porte `artisanId`)
 * → toutes les opérations sont scopées au tenant courant. `ownsEntite` sert l'anti-IDOR FK du
 * rattachement optionnel (l'entité liée doit appartenir au tenant).
 */
export interface IActiviteRepository {
  /** Activités du tenant, triées « à faire d'abord » puis par échéance croissante (parité legacy). */
  list(ctx: TenantContext): Promise<Activite[]>;
  /** Crée une activité pour le tenant. `echeance` doit être une date pure normalisée (YYYY-MM-DD). */
  create(ctx: TenantContext, input: CreateActiviteInput): Promise<Activite>;
  /** L'entité (`client`/`devis`/`facture`/`chantier`) `entiteId` appartient-elle au tenant ? Anti-IDOR FK. */
  ownsEntite(ctx: TenantContext, entiteType: ActiviteEntiteType, entiteId: number): Promise<boolean>;
  /** Bascule fait/à-faire (positionne/efface `faitAt`). `false` si l'activité n'appartient pas au tenant. */
  setFait(ctx: TenantContext, id: number, fait: boolean): Promise<boolean>;
  /** Supprime une activité. `false` si elle n'appartient pas au tenant. */
  remove(ctx: TenantContext, id: number): Promise<boolean>;
}
