import { eq } from "drizzle-orm";
import { demandesAvis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withPublicToken } from "../../../shared/db";
import type { PublicDemandeAvisReader, DemandeAvisPublic } from "../application/public-demande-reader";

/*
 * Lecture d'une demande d'avis par token via la policy RLS publique (`app.public_token`). La
 * connexion (rôle app_tenant, sous RLS) ne voit QUE la demande dont le token est présenté → pas de
 * fuite cross-tenant. Aucune écriture ici (les effets de bord repassent par `withTenant`).
 */
export class PublicDemandeAvisReaderDrizzle implements PublicDemandeAvisReader {
  constructor(private readonly db: DbClient) {}

  getByToken(token: string): Promise<DemandeAvisPublic | null> {
    return withPublicToken(this.db, token, async (tx) => {
      const [r] = await tx
        .select({
          id: demandesAvis.id,
          artisanId: demandesAvis.artisanId,
          clientId: demandesAvis.clientId,
          interventionId: demandesAvis.interventionId,
          statut: demandesAvis.statut,
          expiresAt: demandesAvis.expiresAt,
        })
        .from(demandesAvis)
        .where(eq(demandesAvis.tokenDemande, token))
        .limit(1);
      if (!r) return null;
      return { id: r.id, artisanId: r.artisanId, clientId: r.clientId, interventionId: r.interventionId, statut: r.statut ?? "envoyee", expiresAt: r.expiresAt };
    });
  }
}
