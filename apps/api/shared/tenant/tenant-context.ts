// Contexte multi-tenant : l'identité résolue d'une requête. Exigé par tous les
// repositories et use-cases de la nouvelle architecture pour scoper chaque accès
// au tenant (l'artisan). Aucune méthode de domaine ne doit accéder à la DB sans lui.

export interface TenantContext {
  readonly artisanId: number;
  readonly userId: number;
  readonly role?: string;
}

// Claims portés par le JWT d'authentification. Le token ne contient PAS l'artisanId :
// il est résolu côté serveur (par un TenantResolver) à partir du userId.
export interface TokenClaims {
  readonly userId: number;
  readonly email: string;
}

// Port : résout le TenantContext complet (avec artisanId + role) à partir des claims
// du token. L'implémentation concrète (adapter Drizzle) vit hors du domaine.
export interface TenantResolver {
  resolve(claims: TokenClaims): Promise<TenantContext | null>;
}

export class UnauthenticatedError extends Error {
  constructor(message = "Authentification requise") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class MissingTenantError extends Error {
  constructor(message = "Aucun tenant (artisan) associé à l'utilisateur") {
    super(message);
    this.name = "MissingTenantError";
  }
}
