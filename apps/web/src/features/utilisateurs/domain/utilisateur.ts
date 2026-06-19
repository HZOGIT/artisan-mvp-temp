import type { RouterInputs, RouterOutputs } from "@/shared/trpc";
import { PERMISSION_GROUPS, ROLE_TEMPLATES } from "@shared/permissions";

/*
 * Couche DOMAIN de la feature `utilisateurs` (clean-archi) : types dérivés du routeur + matrice de
 * permissions et règles PURES (toggle, customisation vs défaut du rôle, nom affichable). Les données
 * statiques de permissions viennent de `@shared/permissions` (source unique front/back). 0 React/tRPC.
 */

export type Utilisateur = RouterOutputs["utilisateurs"]["list"][number];
export type CurrentUser = NonNullable<RouterOutputs["auth"]["me"]>;
export type InvitableRole = RouterInputs["utilisateurs"]["invite"]["role"];

/** Rôles affichés dans la matrice (admin inclus, non invitable) ; rôles invitables (sans admin). */
export const ROLES = ["admin", "artisan", "secretaire", "technicien"] as const;
export const INVITABLE_ROLES = ["artisan", "secretaire", "technicien"] as const;

export interface MatrixRow {
  readonly label: string;
  readonly group: string;
  /** aligné sur ROLES */
  readonly roles: boolean[];
}

/** Matrice statique « permission × rôle » dérivée des templates (parité legacy, calculée hors composant). */
export function buildMatrixRows(): MatrixRow[] {
  return PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map((p) => ({
      label: p.label,
      group: group.label,
      roles: ROLES.map((r) => (ROLE_TEMPLATES[r] ?? []).includes(p.code)),
    })),
  );
}

/** Permissions par défaut d'un rôle (codes), tableau vide si rôle inconnu. */
export function roleDefaults(role: string): string[] {
  return [...(ROLE_TEMPLATES[role] ?? [])];
}

/** Toggle PUR d'un code de permission dans la liste locale. */
export function togglePermission(perms: readonly string[], code: string): string[] {
  return perms.includes(code) ? perms.filter((p) => p !== code) : [...perms, code];
}

/** Un code diffère-t-il du défaut du rôle (personnalisé) ? PUR. */
export function isCustomized(defaults: readonly string[], localPerms: readonly string[], code: string): boolean {
  return defaults.includes(code) !== localPerms.includes(code);
}

/** Au moins une permission personnalisée (≠ défaut du rôle) ? PUR — parcourt toutes les permissions. */
export function hasAnyCustomization(defaults: readonly string[], localPerms: readonly string[]): boolean {
  return PERMISSION_GROUPS.some((g) => g.permissions.some((p) => isCustomized(defaults, localPerms, p.code)));
}

/** Nom affichable « Prénom Nom » (ou Nom seul), "" si rien — l'UI ajoute le repli email/tiret. */
export function fullName(u: Pick<Utilisateur, "prenom" | "name">): string {
  if (u.prenom) return `${u.prenom} ${u.name ?? ""}`.trim();
  return u.name ?? "";
}

export { PERMISSION_GROUPS };
