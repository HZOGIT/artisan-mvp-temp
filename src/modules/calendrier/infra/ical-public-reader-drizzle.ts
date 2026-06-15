import { and, asc, eq, gte } from "drizzle-orm";
import { artisans, clients, interventions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { IcalEvent } from "../domain/ical";
import type { IcalPublicReader, IcalFeedData } from "../application/ical-public-reader";

const clientNom = (prenom: string | null, nom: string | null): string => `${prenom ?? ""} ${nom ?? ""}`.trim();

// Résout l'artisan par `icalToken` (table identité, HORS RLS → lecture directe), puis lit ses
// interventions SOUS LE TENANT résolu (`withTenant`/RLS) depuis `since`, enrichies du client.
// Le jeton EST la capacité — aucun accès cross-tenant (les interventions sont scopées artisanId).
export class IcalPublicReaderDrizzle implements IcalPublicReader {
  constructor(private readonly db: DbClient) {}

  async getFeedByToken(token: string, since: Date): Promise<IcalFeedData | null> {
    const [a] = await this.db.select({ id: artisans.id, nomEntreprise: artisans.nomEntreprise }).from(artisans).where(eq(artisans.icalToken, token)).limit(1);
    if (!a) return null;

    const events = await withTenant(this.db, { artisanId: a.id, userId: 0 }, async (tx) => {
      const rows = await tx
        .select({
          id: interventions.id,
          titre: interventions.titre,
          dateDebut: interventions.dateDebut,
          dateFin: interventions.dateFin,
          adresse: interventions.adresse,
          description: interventions.description,
          statut: interventions.statut,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
        })
        .from(interventions)
        .leftJoin(clients, and(eq(clients.id, interventions.clientId), eq(clients.artisanId, a.id)))
        .where(and(eq(interventions.artisanId, a.id), gte(interventions.dateDebut, since)))
        .orderBy(asc(interventions.dateDebut));
      return rows.map(
        (r): IcalEvent => ({
          id: r.id,
          titre: r.titre,
          dateDebut: r.dateDebut,
          dateFin: r.dateFin ?? null,
          adresse: r.adresse ?? null,
          description: r.description ?? null,
          statut: r.statut ?? null,
          clientNom: clientNom(r.clientPrenom, r.clientNom) || null,
          clientTelephone: r.clientTelephone ?? null,
        }),
      );
    });

    return { calName: a.nomEntreprise ?? "Interventions", events };
  }
}
