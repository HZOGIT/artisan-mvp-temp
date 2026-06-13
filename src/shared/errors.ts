// Erreurs de domaine partagées. Les use-cases les lèvent ; les adapters (tRPC/HTTP)
// les traduisent en codes de transport. Un accès à une ressource d'un autre tenant
// doit se traduire par NotFoundError (on ne révèle pas l'existence) ou ForbiddenError.

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "Ressource introuvable") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "Accès refusé") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor(message = "Conflit") {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  readonly code = "VALIDATION" as const;
  constructor(message = "Données invalides") {
    super(message);
    this.name = "ValidationError";
  }
}
