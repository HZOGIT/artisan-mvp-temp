import { and, desc, eq, ilike, or } from "drizzle-orm";
import { clients, devis, factures, fournisseurs, interventions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ISearchReader } from "../application/search-reader";
import type { SearchMatches } from "../domain/search";

// Lecteur Drizzle de la recherche globale : 5 requêtes `ilike` scopées tenant (RLS via withTenant +
// filtre explicite `artisanId`), bornées par entité (parité legacy : 5/5/5/5/3). Lecture seule.
export class SearchReaderDrizzle implements ISearchReader {
  constructor(private readonly db: DbClient) {}

  async search(ctx: TenantContext, query: string): Promise<SearchMatches> {
    const like = `%${query}%`;
    const aid = ctx.artisanId;
    return withTenant(this.db, ctx, async (tx) => {
      const [clientsRows, devisRows, facturesRows, interventionsRows, fournisseursRows] = await Promise.all([
        tx
          .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom, email: clients.email, telephone: clients.telephone, ville: clients.ville })
          .from(clients)
          .where(and(eq(clients.artisanId, aid), or(ilike(clients.nom, like), ilike(clients.prenom, like), ilike(clients.email, like), ilike(clients.telephone, like), ilike(clients.ville, like))))
          .orderBy(desc(clients.id))
          .limit(5),
        tx
          .select({ id: devis.id, numero: devis.numero, objet: devis.objet, statut: devis.statut, totalTTC: devis.totalTTC })
          .from(devis)
          .where(and(eq(devis.artisanId, aid), or(ilike(devis.numero, like), ilike(devis.objet, like))))
          .orderBy(desc(devis.id))
          .limit(5),
        tx
          .select({ id: factures.id, numero: factures.numero, objet: factures.objet, statut: factures.statut, totalTTC: factures.totalTTC })
          .from(factures)
          .where(and(eq(factures.artisanId, aid), or(ilike(factures.numero, like), ilike(factures.objet, like))))
          .orderBy(desc(factures.id))
          .limit(5),
        tx
          .select({ id: interventions.id, titre: interventions.titre, statut: interventions.statut, dateDebut: interventions.dateDebut })
          .from(interventions)
          .where(and(eq(interventions.artisanId, aid), or(ilike(interventions.titre, like), ilike(interventions.description, like))))
          .orderBy(desc(interventions.dateDebut))
          .limit(5),
        tx
          .select({ id: fournisseurs.id, nom: fournisseurs.nom, email: fournisseurs.email, telephone: fournisseurs.telephone })
          .from(fournisseurs)
          .where(and(eq(fournisseurs.artisanId, aid), or(ilike(fournisseurs.nom, like), ilike(fournisseurs.email, like))))
          .orderBy(desc(fournisseurs.id))
          .limit(3),
      ]);
      return { clients: clientsRows, devis: devisRows, factures: facturesRows, interventions: interventionsRows, fournisseurs: fournisseursRows };
    });
  }
}
