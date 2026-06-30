import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { artisans, billingCycles, billingEvents, billingSubscriptions, clients, conversations, factures, llmUsage, messages, permissionsUtilisateur, planComptable, rdvEnLigne, users } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IAuthRepository } from "../application/auth-repository";
import type { AuthCredentials, AuthUser } from "../domain/auth";
import { ALL_PERMISSIONS } from "../../../../../packages/contract/permissions";

/** Comptes PCG minimaux à créer pour chaque nouveau tenant (plan comptable de base). */
const PCG_COMPTES = [
  { numeroCompte: "401000", libelle: "Fournisseurs",               classe: 4, type: "passif" as const },
  { numeroCompte: "411000", libelle: "Clients",                     classe: 4, type: "actif" as const },
  { numeroCompte: "425000", libelle: "Personnel — notes de frais",  classe: 4, type: "passif" as const },
  { numeroCompte: "445660", libelle: "TVA déductible",              classe: 4, type: "actif" as const },
  { numeroCompte: "445710", libelle: "TVA collectée",               classe: 4, type: "passif" as const },
  { numeroCompte: "445711", libelle: "TVA collectée 20 %",          classe: 4, type: "passif" as const },
  { numeroCompte: "445712", libelle: "TVA collectée 10 %",          classe: 4, type: "passif" as const },
  { numeroCompte: "445713", libelle: "TVA collectée 5,5 %",         classe: 4, type: "passif" as const },
  { numeroCompte: "445714", libelle: "TVA collectée 2,1 %",         classe: 4, type: "passif" as const },
  { numeroCompte: "512000", libelle: "Banque",                      classe: 5, type: "actif" as const },
  { numeroCompte: "530000", libelle: "Caisse",                      classe: 5, type: "actif" as const },
  { numeroCompte: "607000", libelle: "Achats de marchandises",      classe: 6, type: "charge" as const },
  { numeroCompte: "706000", libelle: "Prestations de services",     classe: 7, type: "produit" as const },
] satisfies { numeroCompte: string; libelle: string; classe: number; type: "actif" | "passif" | "charge" | "produit" }[];

/*
 * Repo auth Drizzle. `users` est HORS RLS (auth précède la résolution du tenant) → accès direct par
 * id/email. Aucune écriture tenant ; seul `lastSignedIn` est mis à jour au login.
 */
export class AuthRepositoryDrizzle implements IAuthRepository {
  constructor(private readonly db: DbClient) {}

  async findCredentials(email: string): Promise<AuthCredentials | null> {
    const [u] = await this.db.select({ id: users.id, email: users.email, password: users.password, actif: users.actif }).from(users).where(eq(users.email, email)).limit(1);
    return u ? { id: u.id, email: u.email ?? null, password: u.password ?? null, actif: u.actif } : null;
  }

  async getById(userId: number): Promise<AuthUser | null> {
    const [u] = await this.db
      .select({ id: users.id, email: users.email, name: users.name, prenom: users.prenom, role: users.role, artisanId: users.artisanId, actif: users.actif })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ? { id: u.id, email: u.email ?? null, name: u.name ?? null, prenom: u.prenom ?? null, role: u.role, artisanId: u.artisanId ?? null, actif: u.actif } : null;
  }

  async touchLastSignedIn(userId: number): Promise<void> {
    await this.db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  }

  async findCredentialsById(userId: number): Promise<AuthCredentials | null> {
    const [u] = await this.db.select({ id: users.id, email: users.email, password: users.password, actif: users.actif }).from(users).where(eq(users.id, userId)).limit(1);
    return u ? { id: u.id, email: u.email ?? null, password: u.password ?? null, actif: u.actif } : null;
  }

  async findIdByEmail(email: string): Promise<number | null> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return u?.id ?? null;
  }

  async updateEmail(userId: number, email: string): Promise<void> {
    await this.db.update(users).set({ email }).where(eq(users.id, userId));
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ password: passwordHash }).where(eq(users.id, userId));
  }

  async setResetToken(userId: number, tokenHash: string, expiry: Date): Promise<void> {
    await this.db.update(users).set({ resetToken: tokenHash, resetTokenExpiry: expiry }).where(eq(users.id, userId));
  }

  async findByValidResetToken(tokenHash: string): Promise<{ id: number } | null> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(and(eq(users.resetToken, tokenHash), gte(users.resetTokenExpiry, new Date()))).limit(1);
    return u ? { id: u.id } : null;
  }

  async resetPasswordWithToken(userId: number, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ password: passwordHash, resetToken: null, resetTokenExpiry: null }).where(eq(users.id, userId));
  }

  async softDelete(userId: number, neutralizedEmail: string): Promise<void> {
    await this.db.update(users).set({ actif: false, email: neutralizedEmail }).where(eq(users.id, userId));
  }

  async getPasswordChangedAt(userId: number): Promise<Date | null> {
    const [u] = await this.db.select({ passwordChangedAt: users.passwordChangedAt }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.passwordChangedAt ?? null;
  }

  async bumpPasswordChangedAt(userId: number): Promise<void> {
    await this.db.update(users).set({ passwordChangedAt: new Date() }).where(eq(users.id, userId));
  }

  async createUser(data: { email: string; passwordHash: string; name?: string | null; registrationIp?: string | null }): Promise<{ id: number; email: string | null }> {
    const [row] = await this.db
      .insert(users)
      .values({ email: data.email, password: data.passwordHash, name: data.name ?? null, loginMethod: "email", lastSignedIn: new Date(), registrationIp: data.registrationIp ?? null })
      .returning({ id: users.id, email: users.email });
    return { id: row.id, email: row.email ?? null };
  }

  async createAndBootstrapUser(data: { email: string; passwordHash: string; name?: string | null; registrationIp?: string | null }): Promise<{ id: number; email: string | null }> {
    const { userId, userEmail, artisanId } = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: data.email, password: data.passwordHash, name: data.name ?? null, loginMethod: "email", lastSignedIn: new Date(), registrationIp: data.registrationIp ?? null })
        .returning({ id: users.id, email: users.email });
      const [artisan] = await tx.insert(artisans).values({ userId: user.id }).returning({ id: artisans.id });
      await tx.update(users).set({ artisanId: artisan.id }).where(eq(users.id, user.id));
      return { userId: user.id, userEmail: user.email ?? null, artisanId: artisan.id };
    });
    /** Best-effort : billing d'essai + permissions owner (non bloquants). */
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);
        const [existing] = await tx.select({ id: billingSubscriptions.id }).from(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, artisanId)).limit(1);
        if (!existing) {
          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          const [newSub] = await tx
            .insert(billingSubscriptions)
            .values({ artisan_id: artisanId, plan_id: "starter", billing_mode: "maison", status: "trialing", trial_ends_at: trialEndsAt })
            .onConflictDoNothing({ target: billingSubscriptions.artisan_id })
            .returning({ id: billingSubscriptions.id });
          if (newSub) {
            await tx.insert(billingEvents).values({
              entity_type: "billing_subscription",
              entity_id: newSub.id,
              event_type: "subscription.created",
              payload: { artisanId, planId: "starter", billingMode: "maison", status: "trialing", trialEndsAt: trialEndsAt.toISOString() },
              actor: "system:registration",
            });
          }
        }
      });
    } catch {
      /* best-effort */
    }
    try {
      await this.db.insert(permissionsUtilisateur)
        .values(ALL_PERMISSIONS.map((p) => ({ userId, permission: p, autorise: true })))
        .onConflictDoNothing({ target: [permissionsUtilisateur.userId, permissionsUtilisateur.permission] });
    } catch {
      /* best-effort */
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);
        await tx.insert(planComptable)
          .values(PCG_COMPTES.map((c) => ({ ...c, artisanId })))
          .onConflictDoNothing({ target: [planComptable.artisanId, planComptable.numeroCompte] });
      });
    } catch {
      /* best-effort */
    }
    return { id: userId, email: userEmail };
  }

  /*
   * Provisionne le compte propriétaire (idempotent). ⚠️ `artisans`/`subscriptions`/`permissions_utilisateur`
   * sont HORS RLS → accès direct scopé par les ids ; seul l'artisan est requis, le reste est best-effort.
   */
  async bootstrapAccount(userId: number): Promise<void> {
    /** 1. Artisan (idempotent via UNIQUE(userId)). */
    let [artisan] = await this.db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, userId)).limit(1);
    if (!artisan) {
      [artisan] = await this.db.insert(artisans).values({ userId }).returning({ id: artisans.id });
    }
    const artisanId = artisan.id;
    /** 2. Lier le propriétaire à son entreprise (requis par subscription/permissions ; idempotent). */
    await this.db.update(users).set({ artisanId }).where(eq(users.id, userId));
    /** 3. Abonnement d'essai (billing maison, si absent) — best-effort. */
    try {
      await this.db.transaction(async (tx) => {
        /** billing_subscriptions a forcerowsecurity=on → poser le tenant avant SELECT/INSERT. */
        await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);
        const [existing] = await tx.select({ id: billingSubscriptions.id }).from(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, artisanId)).limit(1);
        if (!existing) {
          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          const [newSub] = await tx
            .insert(billingSubscriptions)
            .values({ artisan_id: artisanId, plan_id: "starter", billing_mode: "maison", status: "trialing", trial_ends_at: trialEndsAt })
            .onConflictDoNothing({ target: billingSubscriptions.artisan_id })
            .returning({ id: billingSubscriptions.id });
          if (newSub) {
            await tx.insert(billingEvents).values({
              entity_type: "billing_subscription",
              entity_id: newSub.id,
              event_type: "subscription.created",
              payload: { artisanId, planId: "starter", billingMode: "maison", status: "trialing", trialEndsAt: trialEndsAt.toISOString() },
              actor: "system:registration",
            });
          }
        }
      });
    } catch {
      /* best-effort */
    }
    /** 4. Permissions propriétaire = TOUTES — upsert idempotent (ON CONFLICT DO NOTHING). */
    try {
      await this.db.insert(permissionsUtilisateur)
        .values(ALL_PERMISSIONS.map((p) => ({ userId, permission: p, autorise: true })))
        .onConflictDoNothing({ target: [permissionsUtilisateur.userId, permissionsUtilisateur.permission] });
    } catch {
      /* best-effort */
    }
    /** 5. Plan comptable PCG — comptes de base (best-effort, idempotent). */
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);
        await tx.insert(planComptable)
          .values(PCG_COMPTES.map((c) => ({ ...c, artisanId })))
          .onConflictDoNothing({ target: [planComptable.artisanId, planComptable.numeroCompte] });
      });
    } catch {
      /* best-effort */
    }
  }

  async purgePersonalData(userId: number): Promise<void> {
    const [u] = await this.db.select({ artisanId: users.artisanId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u?.artisanId) return;
    const artisanId = u.artisanId;

    await this.db.transaction(async (tx) => {
      /** 1. Clients liés à au moins une facture → pseudonymiser (obligation légale 10 ans). */
      const withInvoice = await tx
        .selectDistinct({ clientId: factures.clientId })
        .from(factures)
        .where(eq(factures.artisanId, artisanId));
      const clientIdsWithInvoice = withInvoice.map((r) => r.clientId);

      if (clientIdsWithInvoice.length > 0) {
        await tx
          .update(clients)
          .set({ nom: "Client anonymisé", prenom: null, email: null, telephone: null, adresse: null, codePostal: null, ville: null, adresseFacturation: null, codePostalFacturation: null, villeFacturation: null, raisonSociale: null, siret: null, numeroTVA: null, notes: null })
          .where(and(eq(clients.artisanId, artisanId), inArray(clients.id, clientIdsWithInvoice)));
      }

      /** 2. Clients sans facture → supprimer. */
      const deleteClientsWhere = clientIdsWithInvoice.length > 0
        ? and(eq(clients.artisanId, artisanId), notInArray(clients.id, clientIdsWithInvoice))
        : eq(clients.artisanId, artisanId);
      await tx.delete(clients).where(deleteClientsWhere);

      /** 3. Messages et conversations (PII dans le contenu). */
      const convIds = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.artisanId, artisanId));
      if (convIds.length > 0) {
        await tx.delete(messages).where(inArray(messages.conversationId, convIds.map((c) => c.id)));
      }
      await tx.delete(conversations).where(eq(conversations.artisanId, artisanId));

      /** 4. RDV en ligne. */
      await tx.delete(rdvEnLigne).where(eq(rdvEnLigne.artisanId, artisanId));

      /** 5. Logs LLM (données d'usage — FK artisans.id). */
      await tx.delete(llmUsage).where(eq(llmUsage.artisanId, artisanId));

      /** 6. PII artisan + marqueur de suppression différée 30j. */
      await tx
        .update(artisans)
        .set({ email: null, telephone: null, iban: null, adresse: null, codePostal: null, ville: null, logo: null, pendingDeletionAt: sql`now()` })
        .where(eq(artisans.id, artisanId));
    });

    /**
     * 7. Billing : subscriptions sans billing_cycles (trialing test) + leurs billing_events — best-effort.
     * Les subscriptions avec billing_cycles (historique réel) ne peuvent pas être supprimées (FK RESTRICT).
     */
    try {
      const subs = await this.db.select({ id: billingSubscriptions.id }).from(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, artisanId));
      const subIds = subs.map((s) => s.id);
      if (subIds.length > 0) {
        const hasCycles = await this.db.select({ id: billingCycles.id }).from(billingCycles).where(inArray(billingCycles.subscription_id, subIds)).limit(1);
        if (hasCycles.length === 0) {
          await this.db.delete(billingEvents).where(and(eq(billingEvents.entity_type, "billing_subscription"), inArray(billingEvents.entity_id, subIds)));
          await this.db.delete(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, artisanId));
        }
      }
    } catch {
      /* best-effort */
    }
  }
}
