import type { TenantContext } from "../../../shared/tenant";
import type { CollaborateurRole, UtilisateurListItem } from "../domain/utilisateur";

/*
 * Port du repository « utilisateurs ». ⚠️ Tables `users`/`permissions_utilisateur` HORS RLS → CHAQUE
 * méthode scope explicitement par `ctx.artisanId` (jamais cross-tenant). Deux notions d'appartenance :
 * - « strict » = `users.artisanId === ctx.artisanId` (collaborateur ; l'OWNER en est exclu — parité legacy) ;
 * - « gérable » = strict OU `users.id === artisan.userId` (inclut l'OWNER ; parité `getPermissions`).
 */
export interface IUtilisateurRepository {
  // Utilisateurs du tenant : OWNER (`artisans.userId`) ∪ `users.artisanId = ctx.artisanId`.
  list(ctx: TenantContext): Promise<UtilisateurListItem[]>;
  // Email déjà utilisé ? (unicité GLOBALE — la colonne `users.email` est unique).
  emailExists(email: string): Promise<boolean>;
  // Crée un collaborateur (scopé tenant) ; renvoie l'identité minimale.
  createCollaborateur(ctx: TenantContext, data: { email: string; name: string; prenom?: string; role: CollaborateurRole; passwordHash: string }): Promise<{ id: number; email: string | null; role: string }>;
  // Change le rôle (strict-owned). `null` si non possédé.
  updateRole(ctx: TenantContext, userId: number, role: CollaborateurRole): Promise<{ id: number; role: string } | null>;
  // Active/désactive (strict-owned). `null` si non possédé.
  toggleActif(ctx: TenantContext, userId: number, actif: boolean): Promise<{ id: number; actif: boolean } | null>;
  // Utilisateur « gérable » par le tenant (strict OU owner) → {id, role} ; null sinon.
  getManageableUser(ctx: TenantContext, userId: number): Promise<{ id: number; role: string } | null>;
  // Permissions accordées (autorise=true) d'un utilisateur. (Appelé après vérif d'appartenance.)
  getPermissions(userId: number): Promise<string[]>;
  // Remplace les permissions d'un utilisateur STRICT-owned (delete+insert). `false` si non possédé.
  setPermissions(ctx: TenantContext, userId: number, permissions: string[]): Promise<boolean>;
  // Raison sociale du tenant (pour l'email d'invitation).
  getNomEntreprise(ctx: TenantContext): Promise<string | null>;
  /*
   * userId du PROPRIÉTAIRE (`artisans.userId`) du tenant — pour interdire qu'un collaborateur
   * (avec `utilisateurs.gerer`) ne désactive/rétrograde le compte owner (lockout). `null` si introuvable.
   */
  getOwnerUserId(ctx: TenantContext): Promise<number | null>;
}
