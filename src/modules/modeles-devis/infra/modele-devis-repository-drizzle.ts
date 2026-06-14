import { and, asc, eq } from "drizzle-orm";
import { modelesDevis, modelesDevisLignes } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleDevisRepository } from "../application/modele-devis-repository";
import type { CreateModeleDevisInput, CreateModeleDevisLigneInput, ModeleDevis, ModeleDevisLigne, UpdateModeleDevisInput } from "../domain/modele-devis";

type ModeleRow = typeof modelesDevis.$inferSelect;
type LigneRow = typeof modelesDevisLignes.$inferSelect;

function toLigne(r: LigneRow): ModeleDevisLigne {
  return {
    id: r.id,
    modeleId: r.modeleId,
    articleId: r.articleId ?? null,
    designation: r.designation,
    description: r.description ?? null,
    quantite: r.quantite ?? "1.00",
    unite: r.unite ?? "unité",
    prixUnitaireHT: r.prixUnitaireHT ?? "0.00",
    tauxTVA: r.tauxTVA ?? "20.00",
    remise: r.remise ?? "0.00",
    ordre: r.ordre ?? 1,
  };
}

function toModele(r: ModeleRow, lignes: ModeleDevisLigne[]): ModeleDevis {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    description: r.description ?? null,
    notes: r.notes ?? null,
    isDefault: r.isDefault ?? false,
    lignes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Valeurs d'insertion d'une ligne (modeleId imposé par le parent ; défauts PG laissés via undefined).
function ligneValues(modeleId: number, l: CreateModeleDevisLigneInput) {
  return {
    modeleId,
    articleId: l.articleId ?? null,
    designation: l.designation,
    description: l.description ?? null,
    quantite: l.quantite ?? undefined,
    unite: l.unite ?? undefined,
    prixUnitaireHT: l.prixUnitaireHT ?? undefined,
    tauxTVA: l.tauxTVA ?? undefined,
    remise: l.remise ?? undefined,
    ordre: l.ordre ?? undefined,
  };
}

// Implémentation Drizzle du repository modeles-devis (agrégat en-tête + lignes). Double cloisonnement
// RLS + filtre `artisanId` sur `modeles_devis`. Les `modeles_devis_lignes` (SANS artisanId) sont
// scopées via l'appartenance du modèle parent au tenant : on ne lit/écrit jamais une ligne sans avoir
// vérifié l'ownership du modèle. Pas de montants dérivés (gabarit, pas de pièce financière).
export class ModeleDevisRepositoryDrizzle implements IModeleDevisRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<ModeleDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(modelesDevis)
        .where(eq(modelesDevis.artisanId, ctx.artisanId))
        .orderBy(asc(modelesDevis.nom), asc(modelesDevis.id));
      // Liste « légère » : en-têtes seuls (lignes = []). Le détail passe par getById.
      return rows.map((r) => toModele(r, []));
    });
  }

  getById(ctx: TenantContext, id: number): Promise<ModeleDevis | null> {
    return withTenant(this.db, ctx, (tx) => this.loadAggregate(tx, ctx, id));
  }

  create(ctx: TenantContext, input: CreateModeleDevisInput): Promise<ModeleDevis> {
    return withTenant(this.db, ctx, async (tx) => {
      const [parent] = await tx
        .insert(modelesDevis)
        .values({
          artisanId: ctx.artisanId,
          nom: input.nom,
          description: input.description ?? null,
          notes: input.notes ?? null,
          isDefault: input.isDefault ?? undefined,
        })
        .returning();
      if (input.lignes?.length) {
        await tx.insert(modelesDevisLignes).values(input.lignes.map((l) => ligneValues(parent.id, l)));
      }
      const aggregate = await this.loadAggregate(tx, ctx, parent.id);
      return aggregate!; // on vient de créer l'agrégat scopé au tenant
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateModeleDevisInput): Promise<ModeleDevis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.owns(tx, ctx, id))) return null;
      const set: Partial<typeof modelesDevis.$inferInsert> = {};
      if (input.nom !== undefined) set.nom = input.nom;
      if (input.description !== undefined) set.description = input.description;
      if (input.notes !== undefined) set.notes = input.notes;
      if (input.isDefault !== undefined) set.isDefault = input.isDefault;
      if (Object.keys(set).length > 0) {
        await tx.update(modelesDevis).set(set).where(and(eq(modelesDevis.id, id), eq(modelesDevis.artisanId, ctx.artisanId)));
      }
      // Remplacement complet des lignes si fournies (sinon les lignes existantes sont conservées).
      if (input.lignes !== undefined) {
        await tx.delete(modelesDevisLignes).where(eq(modelesDevisLignes.modeleId, id));
        if (input.lignes.length) {
          await tx.insert(modelesDevisLignes).values(input.lignes.map((l) => ligneValues(id, l)));
        }
      }
      return this.loadAggregate(tx, ctx, id);
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      // Ne toucher aux lignes que si le modèle appartient bien au tenant (anti-IDOR via le parent).
      if (!(await this.owns(tx, ctx, id))) return false;
      await tx.delete(modelesDevisLignes).where(eq(modelesDevisLignes.modeleId, id));
      const deleted = await tx
        .delete(modelesDevis)
        .where(and(eq(modelesDevis.id, id), eq(modelesDevis.artisanId, ctx.artisanId)))
        .returning({ id: modelesDevis.id });
      return deleted.length > 0;
    });
  }

  // Charge l'agrégat (en-tête scopé + lignes ordonnées). Les lignes ne sont lues qu'APRÈS avoir
  // confirmé l'ownership du modèle par le tenant (scoping via le parent).
  private async loadAggregate(tx: DbClient, ctx: TenantContext, id: number): Promise<ModeleDevis | null> {
    const [header] = await tx
      .select()
      .from(modelesDevis)
      .where(and(eq(modelesDevis.id, id), eq(modelesDevis.artisanId, ctx.artisanId)))
      .limit(1);
    if (!header) return null;
    const lignes = await tx
      .select()
      .from(modelesDevisLignes)
      .where(eq(modelesDevisLignes.modeleId, id))
      .orderBy(asc(modelesDevisLignes.ordre), asc(modelesDevisLignes.id));
    return toModele(header, lignes.map(toLigne));
  }

  addLigne(ctx: TenantContext, modeleId: number, input: CreateModeleDevisLigneInput): Promise<ModeleDevisLigne | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Scope via le parent : insertion seulement si le modèle appartient au tenant (anti-IDOR).
      if (!(await this.owns(tx, ctx, modeleId))) return null;
      const [row] = await tx.insert(modelesDevisLignes).values(ligneValues(modeleId, input)).returning();
      return toLigne(row);
    });
  }

  private async owns(tx: DbClient, ctx: TenantContext, id: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: modelesDevis.id })
      .from(modelesDevis)
      .where(and(eq(modelesDevis.id, id), eq(modelesDevis.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
