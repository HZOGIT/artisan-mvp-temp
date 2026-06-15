import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { artisans, parametresArtisan, avisClients, clients, interventions, articlesArtisan } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IVitrinePublicReader } from "../application/vitrine-public-reader";
import type { ArtisanVitrine, AvisPublic, VitrineParams, VitrinePublicStats } from "../domain/vitrine";

// Lecture publique de la vitrine. `artisans` est HORS RLS → résolution directe par slug. Les autres
// tables (parametres/avis/clients/interventions/articles) sont SOUS RLS → lues sous le scope de
// l'artisan résolu (`withTenant`), le slug faisant office de capacité publique.
export class VitrinePublicReaderDrizzle implements IVitrinePublicReader {
  constructor(private readonly db: DbClient) {}

  private scope(artisanId: number): TenantContext {
    return { artisanId, userId: 0 };
  }

  async getArtisanBySlug(slug: string): Promise<ArtisanVitrine | null> {
    const [r] = await this.db
      .select({
        id: artisans.id, nomEntreprise: artisans.nomEntreprise, specialite: artisans.specialite,
        telephone: artisans.telephone, email: artisans.email, ville: artisans.ville,
        codePostal: artisans.codePostal, adresse: artisans.adresse, siret: artisans.siret, logo: artisans.logo,
      })
      .from(artisans)
      .where(eq(artisans.slug, slug))
      .limit(1);
    if (!r) return null;
    return {
      id: r.id, nomEntreprise: r.nomEntreprise ?? null, specialite: r.specialite ?? null,
      telephone: r.telephone ?? null, email: r.email ?? null, ville: r.ville ?? null,
      codePostal: r.codePostal ?? null, adresse: r.adresse ?? null, siret: r.siret ?? null, logo: r.logo ?? null,
    };
  }

  getVitrineParams(artisanId: number): Promise<VitrineParams | null> {
    return withTenant(this.db, this.scope(artisanId), async (tx) => {
      const [p] = await tx
        .select({
          vitrineActive: parametresArtisan.vitrineActive, vitrineDescription: parametresArtisan.vitrineDescription,
          vitrineZone: parametresArtisan.vitrineZone, vitrineServices: parametresArtisan.vitrineServices,
          vitrineExperience: parametresArtisan.vitrineExperience,
        })
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, artisanId))
        .limit(1);
      if (!p) return null;
      return {
        vitrineActive: p.vitrineActive ?? null, vitrineDescription: p.vitrineDescription ?? null,
        vitrineZone: p.vitrineZone ?? null, vitrineServices: p.vitrineServices ?? null,
        vitrineExperience: p.vitrineExperience ?? null,
      };
    });
  }

  getPublishedAvis(artisanId: number): Promise<AvisPublic[]> {
    return withTenant(this.db, this.scope(artisanId), async (tx) => {
      const rows = await tx
        .select({
          id: avisClients.id, note: avisClients.note, commentaire: avisClients.commentaire,
          reponseArtisan: avisClients.reponseArtisan, reponseAt: avisClients.reponseAt, createdAt: avisClients.createdAt,
          clientNom: clients.nom, clientPrenom: clients.prenom,
        })
        .from(avisClients)
        .leftJoin(clients, eq(clients.id, avisClients.clientId))
        .where(and(eq(avisClients.artisanId, artisanId), eq(avisClients.statut, "publie")))
        .orderBy(desc(avisClients.createdAt));
      return rows.map((r) => ({
        id: r.id, note: r.note, commentaire: r.commentaire ?? null,
        reponseArtisan: r.reponseArtisan ?? null, reponseAt: r.reponseAt ?? null, createdAt: r.createdAt,
        clientNom: `${r.clientPrenom || ""} ${r.clientNom || ""}`.trim() || "Client",
      }));
    });
  }

  getPublicStats(artisanId: number): Promise<VitrinePublicStats> {
    return withTenant(this.db, this.scope(artisanId), async (tx) => {
      const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.artisanId, artisanId));
      const [i] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(interventions)
        .where(and(eq(interventions.artisanId, artisanId), eq(interventions.statut, "terminee")));
      return { totalClients: Number(c?.n ?? 0), totalInterventions: Number(i?.n ?? 0) };
    });
  }

  getArticleCategories(artisanId: number): Promise<string[]> {
    return withTenant(this.db, this.scope(artisanId), async (tx) => {
      const rows = await tx
        .selectDistinct({ categorie: articlesArtisan.categorie })
        .from(articlesArtisan)
        .where(and(eq(articlesArtisan.artisanId, artisanId), isNotNull(articlesArtisan.categorie)));
      return rows.map((r) => r.categorie).filter((c): c is string => Boolean(c));
    });
  }
}
