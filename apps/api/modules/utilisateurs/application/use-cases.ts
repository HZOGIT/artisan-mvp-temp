import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
import type { PasswordHasher } from "../../../shared/ports/password-hasher";
import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionReader } from "../../subscription/application/subscription-reader";
import { ALL_PERMISSIONS, ROLE_TEMPLATES } from "../../../../../packages/contract/permissions";
import type { CollaborateurRole, InviteInput, PermissionsInfo, UtilisateurListItem } from "../domain/utilisateur";
import type { IUtilisateurRepository } from "./utilisateur-repository";

/** Dépendances injectables du module (testables/déterministes). */
export interface UtilisateurDeps {
  readonly repo: IUtilisateurRepository;
  readonly hasher: PasswordHasher;
  readonly email: EmailPort;
  readonly subscriptionReader: ISubscriptionReader;
  /** Génère le mot de passe temporaire (10 car. alphanum. via RNG crypto en prod ; déterministe en test). */
  readonly genTempPassword: () => string;
}

const ROLE_FR: Record<string, string> = { artisan: "Artisan", secretaire: "Secrétaire", technicien: "Technicien" };

/*
 * Protection du PROPRIÉTAIRE : son compte (role/actif/permissions) est immuable via la gestion des
 * utilisateurs. Sans cette garde, un collaborateur disposant de `utilisateurs.gerer` pourrait
 * désactiver/rétrograder l'owner (`artisans.userId`) → lockout/prise de contrôle du compte.
 */
async function assertNotOwner(deps: UtilisateurDeps, ctx: TenantContext, userId: number): Promise<void> {
  const ownerUserId = await deps.repo.getOwnerUserId(ctx);
  if (ownerUserId !== null && userId === ownerUserId) {
    throw new ForbiddenError("Le compte propriétaire ne peut pas être modifié via la gestion des utilisateurs.");
  }
}

/** Échappement HTML minimal (parité legacy `safeHtml`) pour l'injection de la raison sociale dans l'email. */
function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function listUtilisateurs(deps: UtilisateurDeps, ctx: TenantContext): Promise<UtilisateurListItem[]> {
  return deps.repo.list(ctx);
}

/*
 * Invite un collaborateur : email unique (409) → MDP temp haché (bcrypt) → création → seed des
 * permissions du rôle (best-effort) → email d'invitation (best-effort). Parité legacy `invite`.
 */
export async function inviterUtilisateur(deps: UtilisateurDeps, ctx: TenantContext, input: InviteInput): Promise<{ id: number; email: string | null; role: string }> {
  if (await deps.repo.emailExists(input.email)) {
    throw new ConflictError("Cet email est déjà utilisé");
  }

  const subscription = await deps.subscriptionReader.getSubscription(ctx);
  const maxUsers = subscription?.maxUsers ?? 1;
  const allUsers = await deps.repo.list(ctx);
  const activeUsers = allUsers.filter((u) => u.actif).length;
  if (activeUsers >= maxUsers) {
    throw new ConflictError(`Limite d'utilisateurs actifs atteinte (${maxUsers})`);
  }
  const tempPassword = deps.genTempPassword();
  const passwordHash = await deps.hasher.hash(tempPassword);
  const newUser = await deps.repo.createCollaborateur(ctx, { email: input.email, name: input.nom, prenom: input.prenom, role: input.role, passwordHash });

  /** Seed des permissions par défaut du rôle (best-effort : un échec ne bloque pas l'invitation). */
  try {
    await deps.repo.setPermissions(ctx, newUser.id, [...(ROLE_TEMPLATES[input.role] ?? ROLE_TEMPLATES.artisan)]);
  } catch {
    /* best-effort */
  }

  /** Email d'invitation (best-effort). */
  try {
    const nomEntreprise = (await deps.repo.getNomEntreprise(ctx)) || "Operioz";
    await deps.email.send({
      to: input.email,
      subject: `Invitation à rejoindre ${nomEntreprise}`,
      body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;">
        <h2 style="color:#4F46E5;">Bienvenue sur Operioz !</h2>
        <p>Vous avez été invité(e) à rejoindre <strong>${safeHtml(nomEntreprise)}</strong> en tant que <strong>${ROLE_FR[input.role] || input.role}</strong>.</p>
        <p>Vos identifiants de connexion :</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Email :</strong> ${safeHtml(input.email)}</p>
          <p style="margin:4px 0;"><strong>Mot de passe temporaire :</strong> ${tempPassword}</p>
        </div>
        <p>Connectez-vous et changez votre mot de passe dès que possible.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">Operioz - Gestion complète pour artisans du bâtiment</p>
      </body></html>`,
    });
  } catch {
    /* best-effort */
  }

  return newUser;
}

/** Change le rôle d'un collaborateur (anti-IDOR strict) + réinitialise ses permissions aux défauts du rôle. */
export async function changerRole(deps: UtilisateurDeps, ctx: TenantContext, userId: number, role: CollaborateurRole): Promise<{ id: number; role: string }> {
  await assertNotOwner(deps, ctx, userId);
  const updated = await deps.repo.updateRole(ctx, userId, role);
  if (!updated) throw new NotFoundError("Utilisateur non trouvé dans votre entreprise");
  await deps.repo.setPermissions(ctx, userId, [...(ROLE_TEMPLATES[role] ?? ROLE_TEMPLATES.artisan)]);
  return updated;
}

export async function basculerActif(deps: UtilisateurDeps, ctx: TenantContext, userId: number, actif: boolean): Promise<{ id: number; actif: boolean }> {
  await assertNotOwner(deps, ctx, userId);
  const updated = await deps.repo.toggleActif(ctx, userId, actif);
  if (!updated) throw new NotFoundError("Utilisateur non trouvé dans votre entreprise");
  return updated;
}

export async function lirePermissions(deps: UtilisateurDeps, ctx: TenantContext, userId: number): Promise<PermissionsInfo> {
  const user = await deps.repo.getManageableUser(ctx, userId);
  if (!user) throw new NotFoundError("Utilisateur non trouvé");
  const permissions = await deps.repo.getPermissions(userId);
  return { userId, role: user.role, permissions, roleDefaults: [...(ROLE_TEMPLATES[user.role] ?? [])] };
}

/** Définit les permissions : filtre celles du catalogue (anti-injection) puis applique (strict-owned). */
export async function definirPermissions(deps: UtilisateurDeps, ctx: TenantContext, userId: number, permissions: string[]): Promise<{ success: true; count: number }> {
  await assertNotOwner(deps, ctx, userId);
  const valid = permissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  if (!(await deps.repo.setPermissions(ctx, userId, valid))) {
    throw new NotFoundError("Utilisateur non trouvé dans votre entreprise");
  }
  return { success: true, count: valid.length };
}

/** Réinitialise les permissions aux défauts du rôle. */
export async function reinitialiserPermissions(deps: UtilisateurDeps, ctx: TenantContext, userId: number): Promise<{ success: true; permissions: string[] }> {
  await assertNotOwner(deps, ctx, userId);
  const user = await deps.repo.getManageableUser(ctx, userId);
  if (!user) throw new NotFoundError("Utilisateur non trouvé");
  const defaults = [...(ROLE_TEMPLATES[user.role] ?? ROLE_TEMPLATES.artisan)];
  if (!(await deps.repo.setPermissions(ctx, userId, defaults))) {
    throw new NotFoundError("Utilisateur non trouvé dans votre entreprise");
  }
  return { success: true, permissions: defaults };
}
