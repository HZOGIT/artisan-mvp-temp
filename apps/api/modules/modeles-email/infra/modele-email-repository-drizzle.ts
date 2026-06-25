import { and, asc, eq } from "drizzle-orm";
import { modelesEmail } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleEmailRepository } from "../application/modele-email-repository";
import type { CreateModeleEmailInput, ModeleEmail, TypeModeleEmail, UpdateModeleEmailInput } from "../domain/modele-email";

type ModeleEmailRow = typeof modelesEmail.$inferSelect;

function toModeleEmail(r: ModeleEmailRow): ModeleEmail {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    type: r.type as TypeModeleEmail,
    sujet: r.sujet,
    contenu: r.contenu,
    isDefault: r.isDefault ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository modeles-email. Double cloisonnement RLS + filtre `artisanId`
 * sur `modeles_email`. `artisanId` est forcé au tenant à la création. ⚠️ La règle « un seul
 * isDefault par (artisanId, type) » est portée par le write use-case (4/9), pas par le repo : le
 * repo écrit fidèlement ce qu'on lui donne.
 */
export class ModeleEmailRepositoryDrizzle implements IModeleEmailRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<ModeleEmail[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(modelesEmail)
        .where(eq(modelesEmail.artisanId, ctx.artisanId))
        .orderBy(asc(modelesEmail.nom), asc(modelesEmail.id));
      return rows.map(toModeleEmail);
    });
  }

  listByType(ctx: TenantContext, type: TypeModeleEmail): Promise<ModeleEmail[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(modelesEmail)
        .where(and(eq(modelesEmail.artisanId, ctx.artisanId), eq(modelesEmail.type, type)))
        .orderBy(asc(modelesEmail.nom), asc(modelesEmail.id));
      return rows.map(toModeleEmail);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<ModeleEmail | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(modelesEmail)
        .where(and(eq(modelesEmail.id, id), eq(modelesEmail.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toModeleEmail(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateModeleEmailInput): Promise<ModeleEmail> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(modelesEmail)
        .values({
          artisanId: ctx.artisanId,
          nom: input.nom,
          type: input.type,
          sujet: input.sujet,
          contenu: input.contenu,
          isDefault: input.isDefault ?? undefined,
        })
        .returning();
      return toModeleEmail(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateModeleEmailInput): Promise<ModeleEmail | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Construit le set des seuls champs fournis (no-op si vide : renvoie l'état courant scopé). */
      const set: Partial<typeof modelesEmail.$inferInsert> = {};
      if (input.nom !== undefined) set.nom = input.nom;
      if (input.type !== undefined) set.type = input.type;
      if (input.sujet !== undefined) set.sujet = input.sujet;
      if (input.contenu !== undefined) set.contenu = input.contenu;
      if (input.isDefault !== undefined) set.isDefault = input.isDefault;
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(modelesEmail)
          .where(and(eq(modelesEmail.id, id), eq(modelesEmail.artisanId, ctx.artisanId)))
          .limit(1);
        return row ? toModeleEmail(row) : null;
      }
      const [row] = await tx
        .update(modelesEmail)
        .set(set)
        .where(and(eq(modelesEmail.id, id), eq(modelesEmail.artisanId, ctx.artisanId)))
        .returning();
      return row ? toModeleEmail(row) : null;
    });
  }

  getDefaultByType(ctx: TenantContext, type: TypeModeleEmail): Promise<ModeleEmail | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(modelesEmail)
        .where(and(eq(modelesEmail.artisanId, ctx.artisanId), eq(modelesEmail.type, type), eq(modelesEmail.isDefault, true)))
        .limit(1);
      return row ? toModeleEmail(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(modelesEmail)
        .where(and(eq(modelesEmail.id, id), eq(modelesEmail.artisanId, ctx.artisanId)))
        .returning({ id: modelesEmail.id });
      return deleted.length > 0;
    });
  }
}
