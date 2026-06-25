import { eq } from "drizzle-orm";
import { parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IParametresRepository } from "../application/parametres-repository";
import { defaultParametres } from "../domain/parametres";
import type { ParametresArtisan, UpdateParametresInput } from "../domain/parametres";

type ParametresRow = typeof parametresArtisan.$inferSelect;
type ParametresInsert = typeof parametresArtisan.$inferInsert;

/** socle de défauts (artisanId remplacé au mapping) */
const D = defaultParametres(0);

/*
 * Mappe une ligne PG → domaine. Les colonnes nullable avec DEFAULT (prefixes, compteurs, couleurs…)
 * peuvent être null en base si insérées hors défaut ; on retombe sur les défauts du domaine.
 */
function toParametres(r: ParametresRow): ParametresArtisan {
  return {
    artisanId: r.artisanId,
    prefixeDevis: r.prefixeDevis ?? D.prefixeDevis,
    prefixeFacture: r.prefixeFacture ?? D.prefixeFacture,
    prefixeAvoir: r.prefixeAvoir ?? D.prefixeAvoir,
    compteurDevis: r.compteurDevis ?? D.compteurDevis,
    compteurFacture: r.compteurFacture ?? D.compteurFacture,
    compteurAvoir: r.compteurAvoir ?? D.compteurAvoir,
    mentionsLegales: r.mentionsLegales ?? null,
    conditionsGenerales: r.conditionsGenerales ?? null,
    mediateurConsommation: r.mediateurConsommation ?? null,
    conditionsPaiementDefaut: r.conditionsPaiementDefaut ?? null,
    delaiPaiementJours: r.delaiPaiementJours ?? null,
    delaiPaiementType: r.delaiPaiementType ?? D.delaiPaiementType,
    notificationsEmail: r.notificationsEmail ?? D.notificationsEmail,
    rappelDevisJours: r.rappelDevisJours ?? D.rappelDevisJours,
    rappelFactureJours: r.rappelFactureJours ?? D.rappelFactureJours,
    objectifCA: r.objectifCA ?? D.objectifCA,
    objectifDevis: r.objectifDevis ?? D.objectifDevis,
    objectifClients: r.objectifClients ?? D.objectifClients,
    couleurPrincipale: r.couleurPrincipale ?? D.couleurPrincipale,
    couleurSecondaire: r.couleurSecondaire ?? D.couleurSecondaire,
  };
}

/*
 * Ne retient que les champs config réellement fournis (les autres restent inchangés). ⚠️ AUCUN
 * compteur ici — ils sont pilotés par la numérotation des documents et inviolables via la config.
 */
function toConfigSet(input: UpdateParametresInput): Partial<ParametresInsert> {
  const set: Partial<ParametresInsert> = {};
  if (input.prefixeDevis !== undefined) set.prefixeDevis = input.prefixeDevis;
  if (input.prefixeFacture !== undefined) set.prefixeFacture = input.prefixeFacture;
  if (input.prefixeAvoir !== undefined) set.prefixeAvoir = input.prefixeAvoir;
  if (input.mentionsLegales !== undefined) set.mentionsLegales = input.mentionsLegales;
  if (input.conditionsGenerales !== undefined) set.conditionsGenerales = input.conditionsGenerales;
  if (input.mediateurConsommation !== undefined) set.mediateurConsommation = input.mediateurConsommation;
  if (input.conditionsPaiementDefaut !== undefined) set.conditionsPaiementDefaut = input.conditionsPaiementDefaut;
  if (input.delaiPaiementJours !== undefined) set.delaiPaiementJours = input.delaiPaiementJours;
  if (input.delaiPaiementType !== undefined) set.delaiPaiementType = input.delaiPaiementType as ParametresInsert["delaiPaiementType"];
  if (input.notificationsEmail !== undefined) set.notificationsEmail = input.notificationsEmail;
  if (input.rappelDevisJours !== undefined) set.rappelDevisJours = input.rappelDevisJours;
  if (input.rappelFactureJours !== undefined) set.rappelFactureJours = input.rappelFactureJours;
  if (input.objectifCA !== undefined) set.objectifCA = input.objectifCA;
  if (input.objectifDevis !== undefined) set.objectifDevis = input.objectifDevis;
  if (input.objectifClients !== undefined) set.objectifClients = input.objectifClients;
  if (input.couleurPrincipale !== undefined) set.couleurPrincipale = input.couleurPrincipale;
  if (input.couleurSecondaire !== undefined) set.couleurSecondaire = input.couleurSecondaire;
  return set;
}

/*
 * Implémentation Drizzle du repository parametres (configuration artisan, singleton par tenant).
 * Double cloisonnement RLS + filtre `artisanId` sur `parametres_artisan` (artisanId UNIQUE).
 */
export class ParametresRepositoryDrizzle implements IParametresRepository {
  constructor(private readonly db: DbClient) {}

  get(ctx: TenantContext): Promise<ParametresArtisan> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      return row ? toParametres(row) : defaultParametres(ctx.artisanId);
    });
  }

  upsert(ctx: TenantContext, input: UpdateParametresInput): Promise<ParametresArtisan> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toConfigSet(input);
      /*
       * Singleton idempotent : crée la ligne du tenant si absente, sinon met à jour les seuls champs
       * config fournis. `artisanId` forcé au tenant ; compteurs jamais touchés (prennent les DEFAULT
       * à la création, restent inchangés ensuite). Input vide → garantit juste l'existence de la
       * ligne (DO NOTHING, pas de SET vide). On relit pour renvoyer l'état canonique.
       */
      const ins = tx.insert(parametresArtisan).values({ artisanId: ctx.artisanId, ...set });
      await (Object.keys(set).length === 0
        ? ins.onConflictDoNothing({ target: parametresArtisan.artisanId })
        : ins.onConflictDoUpdate({ target: parametresArtisan.artisanId, set }));
      const [row] = await tx
        .select()
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      return toParametres(row);
    });
  }
}
