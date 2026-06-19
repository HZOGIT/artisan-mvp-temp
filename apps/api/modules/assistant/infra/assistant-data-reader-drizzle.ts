import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artisans,
  articlesArtisan,
  bibliothequeArticles,
  clients,
  devis,
  devisLignes,
  factures,
} from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { DevisAnalyseData, TresorerieData } from "../domain/generators";
import type { AssistantDataReader, DevisNonSigneAvecClient } from "../application/assistant-data-reader";

const fmtDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "non définie");
const clientNom = (prenom: string | null, nom: string): string => `${prenom ?? ""} ${nom}`.trim() || "Client";

/*
 * Accès données des générateurs IA de l'assistant, sous RLS (withTenant) + filtre artisanId explicite.
 * Catalogues/tarifs pré-formatés ici (parité legacy). `getDevisAnalyse` renvoie null si le devis n'est
 * pas du tenant (anti-IDOR). `articles_artisan`/`devis`/`factures`/`clients` sont sous RLS ;
 * `bibliotheque_articles` est un catalogue GLOBAL (filtre métier, pas de scope tenant).
 */
export class AssistantDataReaderDrizzle implements AssistantDataReader {
  constructor(private readonly db: DbClient) {}

  listDevisNonSignes(ctx: TenantContext): Promise<DevisNonSigneAvecClient[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          numero: devis.numero,
          objet: devis.objet,
          totalTTC: devis.totalTTC,
          dateDevis: devis.dateDevis,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientEmail: clients.email,
        })
        .from(devis)
        .leftJoin(clients, eq(clients.id, devis.clientId))
        .where(and(eq(devis.artisanId, ctx.artisanId), inArray(devis.statut, ["brouillon", "envoye"])))
        .orderBy(desc(devis.createdAt));
      return rows.map((r) => ({
        numero: r.numero,
        objet: r.objet ?? null,
        totalTTC: r.totalTTC ?? "0.00",
        dateDevis: r.dateDevis,
        clientNom: clientNom(r.clientPrenom, r.clientNom ?? "Client"),
        clientEmail: r.clientEmail ?? null,
      }));
    });
  }

  /** Métier de l'artisan (table identité, HORS RLS → filtre explicite par id). */
  private async metier(tx: DbClient, ctx: TenantContext): Promise<string | null> {
    const [a] = await tx.select({ metier: artisans.metier, specialite: artisans.specialite }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return (a?.metier as string | null) ?? (a?.specialite as string | null) ?? null;
  }

  private async articlesTenant(tx: DbClient, ctx: TenantContext) {
    return tx
      .select({ designation: articlesArtisan.designation, prix: articlesArtisan.prixUnitaireHT, unite: articlesArtisan.unite })
      .from(articlesArtisan)
      .where(eq(articlesArtisan.artisanId, ctx.artisanId));
  }

  getCatalogue(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      const arts = await this.articlesTenant(tx, ctx);
      const metier = await this.metier(tx, ctx);
      const biblioRows = metier
        ? await tx.select({ nom: bibliothequeArticles.nom, prix: bibliothequeArticles.prix_base, unite: bibliothequeArticles.unite }).from(bibliothequeArticles).where(eq(bibliothequeArticles.metier, metier)).limit(50)
        : [];
      const lignes = [
        ...arts.map((a) => `${a.designation} - ${a.prix}€/${a.unite}`),
        ...biblioRows.map((a) => `${a.nom} - ${a.prix}€/${a.unite}`),
      ];
      return lignes.join("\n");
    });
  }

  getDevisAnalyse(ctx: TenantContext, devisId: number): Promise<DevisAnalyseData | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [d] = await tx
        .select({ numero: devis.numero, totalHT: devis.totalHT, totalTTC: devis.totalTTC, clientId: devis.clientId })
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      /** hors tenant / inexistant → anti-IDOR */
      if (!d) return null;

      const [c] = await tx.select({ nom: clients.nom, prenom: clients.prenom }).from(clients).where(and(eq(clients.id, d.clientId), eq(clients.artisanId, ctx.artisanId))).limit(1);
      const lignes = await tx
        .select({ designation: devisLignes.designation, quantite: devisLignes.quantite, unite: devisLignes.unite, prixUnitaireHT: devisLignes.prixUnitaireHT, tauxTVA: devisLignes.tauxTVA })
        .from(devisLignes)
        .where(eq(devisLignes.devisId, devisId));
      const arts = (await this.articlesTenant(tx, ctx)).slice(0, 30);
      const tarifs = arts.map((a) => `${a.designation}: ${a.prix}€/${a.unite}`).join("\n");

      return {
        numero: d.numero,
        totalHT: d.totalHT ?? "0.00",
        totalTTC: d.totalTTC ?? "0.00",
        clientNom: clientNom(c?.prenom ?? null, c?.nom ?? "client"),
        lignes: lignes.map((l) => ({
          designation: l.designation,
          quantite: l.quantite ?? "1.00",
          unite: l.unite ?? "u",
          prixUnitaireHT: l.prixUnitaireHT ?? "0.00",
          tauxTVA: l.tauxTVA ?? "20.00",
        })),
        tarifs,
      };
    });
  }

  getTresorerie(ctx: TenantContext): Promise<TresorerieData> {
    return withTenant(this.db, ctx, async (tx) => {
      const facs = await tx
        .select({ numero: factures.numero, totalTTC: factures.totalTTC, statut: factures.statut, dateEcheance: factures.dateEcheance, datePaiement: factures.datePaiement, createdAt: factures.createdAt })
        .from(factures)
        .where(eq(factures.artisanId, ctx.artisanId));
      const devisAcc = await tx
        .select({ numero: devis.numero, totalTTC: devis.totalTTC })
        .from(devis)
        .where(and(eq(devis.artisanId, ctx.artisanId), eq(devis.statut, "accepte")));

      const facturesPayees = facs
        .filter((f) => f.statut === "payee")
        .slice(0, 20)
        .map((f) => `FAC ${f.numero}: ${f.totalTTC}€ payée le ${fmtDate(f.datePaiement ?? f.createdAt)}`)
        .join("\n");
      const facturesImpayees = facs
        .filter((f) => f.statut !== "payee" && f.statut !== "annulee")
        .map((f) => `FAC ${f.numero}: ${f.totalTTC}€ (${f.statut}) échéance ${fmtDate(f.dateEcheance)}`)
        .join("\n");
      const devisAcceptes = devisAcc.map((d) => `DEV ${d.numero}: ${d.totalTTC}€`).join("\n");

      return { facturesPayees, facturesImpayees, devisAcceptes };
    });
  }
}
