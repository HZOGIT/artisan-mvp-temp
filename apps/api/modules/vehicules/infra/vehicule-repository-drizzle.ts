import { and, asc, desc, eq, gte, lte, inArray, isNotNull, getTableColumns, sql } from "drizzle-orm";
import { vehicules, entretiensVehicules, assurancesVehicules, historiqueKilometrage } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IVehiculeRepository } from "../application/vehicule-repository";
import type {
  Vehicule,
  CreateVehiculeInput,
  UpdateVehiculeInput,
  EntretienVehicule,
  CreateEntretienInput,
  AssuranceVehicule,
  CreateAssuranceInput,
  ReleveKilometrage,
  CreateKilometrageInput,
  StatistiquesFlotte,
} from "../domain/vehicule";

type VehiculeRow = typeof vehicules.$inferSelect;
type EntretienRow = typeof entretiensVehicules.$inferSelect;
type AssuranceRow = typeof assurancesVehicules.$inferSelect;
type ReleveRow = typeof historiqueKilometrage.$inferSelect;

function toReleve(r: ReleveRow): ReleveKilometrage {
  return {
    id: r.id,
    vehiculeId: r.vehiculeId,
    technicienId: r.technicienId ?? null,
    kilometrage: r.kilometrage,
    dateReleve: r.dateReleve,
    motif: r.motif ?? null,
    createdAt: r.createdAt,
  };
}

function toVehicule(r: VehiculeRow): Vehicule {
  return {
    id: r.id,
    artisanId: r.artisanId,
    immatriculation: r.immatriculation,
    marque: r.marque ?? null,
    modele: r.modele ?? null,
    annee: r.annee ?? null,
    typeCarburant: (r.typeCarburant ?? "diesel") as Vehicule["typeCarburant"],
    puissanceFiscale: r.puissanceFiscale ?? null,
    kilometrageActuel: r.kilometrageActuel ?? 0,
    dateAchat: r.dateAchat ?? null,
    prixAchat: r.prixAchat ?? null,
    technicienId: r.technicienId ?? null,
    statut: (r.statut ?? "actif") as Vehicule["statut"],
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toEntretien(r: EntretienRow): EntretienVehicule {
  return {
    id: r.id,
    vehiculeId: r.vehiculeId,
    type: r.type as EntretienVehicule["type"],
    dateEntretien: r.dateEntretien,
    kilometrageEntretien: r.kilometrageEntretien ?? null,
    cout: r.cout ?? null,
    prestataire: r.prestataire ?? null,
    description: r.description ?? null,
    prochainEntretienKm: r.prochainEntretienKm ?? null,
    prochainEntretienDate: r.prochainEntretienDate ?? null,
    facture: r.facture ?? null,
    createdAt: r.createdAt,
  };
}

function toAssurance(r: AssuranceRow): AssuranceVehicule {
  return {
    id: r.id,
    vehiculeId: r.vehiculeId,
    compagnie: r.compagnie,
    numeroContrat: r.numeroContrat ?? null,
    typeAssurance: (r.typeAssurance ?? "tiers") as AssuranceVehicule["typeAssurance"],
    dateDebut: r.dateDebut,
    dateFin: r.dateFin,
    primeAnnuelle: r.primeAnnuelle ?? null,
    franchise: r.franchise ?? null,
    document: r.document ?? null,
    alerteEnvoyee: r.alerteEnvoyee ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository vehicules. Double cloisonnement : RLS (rôle app
 * + app.tenant via withTenant) ET filtre explicite `artisanId` dans chaque requête.
 * entretiens/assurances n'ont pas d'artisanId (scopés via le véhicule) → on vérifie
 * l'appartenance du véhicule au tenant avant tout accès (ressource hors tenant → null/[]).
 */
export class VehiculeRepositoryDrizzle implements IVehiculeRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Vehicule[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(vehicules)
        .where(eq(vehicules.artisanId, ctx.artisanId))
        .orderBy(desc(vehicules.id));
      return rows.map(toVehicule);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Vehicule | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(vehicules)
        .where(and(eq(vehicules.id, id), eq(vehicules.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toVehicule(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateVehiculeInput): Promise<Vehicule> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(vehicules)
        .values({ ...input, artisanId: ctx.artisanId } as typeof vehicules.$inferInsert)
        .returning();
      return toVehicule(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateVehiculeInput): Promise<Vehicule | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(vehicules)
        .set({ ...input })
        .where(and(eq(vehicules.id, id), eq(vehicules.artisanId, ctx.artisanId)))
        .returning();
      return row ? toVehicule(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Vérifie l'appartenance AVANT de toucher l'historique (entretiens/assurances
       * n'ont pas d'artisanId → on ne doit pas supprimer celui d'un autre tenant).
       */
      if (!(await this.ownsVehicule(tx, ctx, id))) return false;
      /*
       * Cascade applicative dans la transaction (pas de FK ON DELETE CASCADE en base) :
       * historique d'abord, puis le véhicule. Atomique (rollback si échec).
       */
      await tx.delete(entretiensVehicules).where(eq(entretiensVehicules.vehiculeId, id));
      await tx.delete(assurancesVehicules).where(eq(assurancesVehicules.vehiculeId, id));
      const deleted = await tx
        .delete(vehicules)
        .where(and(eq(vehicules.id, id), eq(vehicules.artisanId, ctx.artisanId)))
        .returning({ id: vehicules.id });
      return deleted.length > 0;
    });
  }

  updateKilometrage(ctx: TenantContext, id: number, kilometrage: number): Promise<Vehicule | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Invariant : le compteur ne recule jamais. */
      const [row] = await tx
        .update(vehicules)
        .set({ kilometrageActuel: sql`GREATEST(${vehicules.kilometrageActuel}, ${kilometrage})` })
        .where(and(eq(vehicules.id, id), eq(vehicules.artisanId, ctx.artisanId)))
        .returning();
      return row ? toVehicule(row) : null;
    });
  }

  listEntretiens(ctx: TenantContext, vehiculeId: number): Promise<EntretienVehicule[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return [];
      const rows = await tx
        .select()
        .from(entretiensVehicules)
        .where(eq(entretiensVehicules.vehiculeId, vehiculeId))
        .orderBy(desc(entretiensVehicules.dateEntretien));
      return rows.map(toEntretien);
    });
  }

  addEntretien(ctx: TenantContext, vehiculeId: number, input: CreateEntretienInput): Promise<EntretienVehicule | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return null;
      const [row] = await tx
        .insert(entretiensVehicules)
        .values({ ...input, vehiculeId } as typeof entretiensVehicules.$inferInsert)
        .returning();
      return toEntretien(row);
    });
  }

  listEntretiensAVenir(ctx: TenantContext): Promise<EntretienVehicule[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await tx
        .select(getTableColumns(entretiensVehicules))
        .from(entretiensVehicules)
        .innerJoin(vehicules, eq(vehicules.id, entretiensVehicules.vehiculeId))
        .where(
          and(
            eq(vehicules.artisanId, ctx.artisanId),
            isNotNull(entretiensVehicules.prochainEntretienDate),
            gte(entretiensVehicules.prochainEntretienDate, today),
          ),
        )
        .orderBy(asc(entretiensVehicules.prochainEntretienDate));
      return rows.map(toEntretien);
    });
  }

  listAssurances(ctx: TenantContext, vehiculeId: number): Promise<AssuranceVehicule[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return [];
      const rows = await tx
        .select()
        .from(assurancesVehicules)
        .where(eq(assurancesVehicules.vehiculeId, vehiculeId))
        .orderBy(desc(assurancesVehicules.dateFin));
      return rows.map(toAssurance);
    });
  }

  addAssurance(ctx: TenantContext, vehiculeId: number, input: CreateAssuranceInput): Promise<AssuranceVehicule | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return null;
      const [row] = await tx
        .insert(assurancesVehicules)
        .values({ ...input, vehiculeId } as typeof assurancesVehicules.$inferInsert)
        .returning();
      return toAssurance(row);
    });
  }

  listAssurancesExpirant(ctx: TenantContext, joursAvant: number): Promise<AssuranceVehicule[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      const limite = new Date(Date.now() + joursAvant * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const rows = await tx
        .select(getTableColumns(assurancesVehicules))
        .from(assurancesVehicules)
        .innerJoin(vehicules, eq(vehicules.id, assurancesVehicules.vehiculeId))
        .where(
          and(
            eq(vehicules.artisanId, ctx.artisanId),
            gte(assurancesVehicules.dateFin, today),
            lte(assurancesVehicules.dateFin, limite),
          ),
        )
        .orderBy(asc(assurancesVehicules.dateFin));
      return rows.map(toAssurance);
    });
  }

  addKilometrage(ctx: TenantContext, vehiculeId: number, input: CreateKilometrageInput): Promise<ReleveKilometrage | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return null;
      const [row] = await tx
        .insert(historiqueKilometrage)
        .values({
          vehiculeId,
          kilometrage: input.kilometrage,
          dateReleve: input.dateReleve,
          motif: input.motif ?? null,
          technicienId: input.technicienId ?? null,
        })
        .returning();
      /** Met à jour le compteur du véhicule (non régressif). */
      await tx
        .update(vehicules)
        .set({ kilometrageActuel: sql`GREATEST(${vehicules.kilometrageActuel}, ${input.kilometrage})` })
        .where(and(eq(vehicules.id, vehiculeId), eq(vehicules.artisanId, ctx.artisanId)));
      return toReleve(row);
    });
  }

  getHistoriqueKilometrage(ctx: TenantContext, vehiculeId: number): Promise<ReleveKilometrage[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsVehicule(tx, ctx, vehiculeId))) return [];
      const rows = await tx
        .select()
        .from(historiqueKilometrage)
        .where(eq(historiqueKilometrage.vehiculeId, vehiculeId))
        .orderBy(desc(historiqueKilometrage.dateReleve), desc(historiqueKilometrage.id));
      return rows.map(toReleve);
    });
  }

  getStatistiquesFlotte(ctx: TenantContext): Promise<StatistiquesFlotte> {
    return withTenant(this.db, ctx, async (tx) => {
      const vehs = await tx.select().from(vehicules).where(eq(vehicules.artisanId, ctx.artisanId));
      const nbVehicules = vehs.length;
      const nbActifs = vehs.filter((v) => v.statut === "actif").length;
      const nbEnMaintenance = vehs.filter((v) => v.statut === "en_maintenance").length;
      const kmTotalFlotte = vehs.reduce((s, v) => s + (v.kilometrageActuel ?? 0), 0);
      const ids = vehs.map((v) => v.id);

      const year = new Date().getFullYear();
      let coutEntretienAnneeEnCours = 0;
      let assurancesAExpirer = 0;
      if (ids.length > 0) {
        const ents = await tx
          .select({ cout: entretiensVehicules.cout })
          .from(entretiensVehicules)
          .where(
            and(
              inArray(entretiensVehicules.vehiculeId, ids),
              gte(entretiensVehicules.dateEntretien, `${year}-01-01`),
              lte(entretiensVehicules.dateEntretien, `${year}-12-31`),
            ),
          );
        coutEntretienAnneeEnCours = ents.reduce((s, e) => s + Number(e.cout ?? 0), 0);

        const today = new Date().toISOString().slice(0, 10);
        const lim = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const ass = await tx
          .select({ id: assurancesVehicules.id })
          .from(assurancesVehicules)
          .where(
            and(
              inArray(assurancesVehicules.vehiculeId, ids),
              gte(assurancesVehicules.dateFin, today),
              lte(assurancesVehicules.dateFin, lim),
            ),
          );
        assurancesAExpirer = ass.length;
      }

      return { nbVehicules, nbActifs, nbEnMaintenance, kmTotalFlotte, coutEntretienAnneeEnCours, assurancesAExpirer };
    });
  }

  withDb(db: DbClient): VehiculeRepositoryDrizzle {
    return new VehiculeRepositoryDrizzle(db);
  }

  /** Vérifie que le véhicule appartient au tenant (RLS + filtre artisanId). */
  private async ownsVehicule(tx: DbClient, ctx: TenantContext, vehiculeId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: vehicules.id })
      .from(vehicules)
      .where(and(eq(vehicules.id, vehiculeId), eq(vehicules.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
