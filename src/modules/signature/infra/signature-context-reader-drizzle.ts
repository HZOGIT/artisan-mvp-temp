import { and, eq } from "drizzle-orm";
import { artisans, clients, devis, notifications } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  SignatureDevisContext,
  SignatureDevisContextReader,
  SignatureNotificationWriter,
  SignatureNotificationType,
} from "../application/signature-repository";

// Lecture du contexte d'un devis (devis + client + artisan) pour composer le lien de signature, SOUS
// LE TENANT (RLS). `devis` et `clients` sont scopés par RLS/artisanId ; `artisans` (identité, HORS
// RLS) est filtré explicitement par `ctx.artisanId`. Renvoie `null` si le devis n'appartient pas au
// tenant → anti-IDOR du parent (la signature reste inaccessible).
export class SignatureContextReaderDrizzle implements SignatureDevisContextReader {
  constructor(private readonly db: DbClient) {}

  getDevisContext(ctx: TenantContext, devisId: number): Promise<SignatureDevisContext | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [d] = await tx
        .select({ id: devis.id, clientId: devis.clientId, numero: devis.numero, objet: devis.objet, totalTTC: devis.totalTTC })
        .from(devis)
        .where(eq(devis.id, devisId))
        .limit(1);
      if (!d) return null;

      const [c] = await tx
        .select({ email: clients.email, prenom: clients.prenom, nom: clients.nom })
        .from(clients)
        .where(and(eq(clients.id, d.clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);

      const [a] = await tx
        .select({ nomEntreprise: artisans.nomEntreprise, email: artisans.email })
        .from(artisans)
        .where(eq(artisans.id, ctx.artisanId))
        .limit(1);

      return {
        devis: {
          id: d.id,
          clientId: d.clientId,
          numero: d.numero,
          objet: d.objet ?? null,
          totalTTC: parseFloat(d.totalTTC ?? "0") || 0,
        },
        client: c ? { email: c.email ?? null, prenom: c.prenom ?? null, nom: c.nom ?? null } : null,
        artisan: a ? { nomEntreprise: a.nomEntreprise ?? null, email: a.email ?? null } : null,
      };
    });
  }
}

// Écrit une notification artisan sous le tenant (RLS) — `artisanId` forcé = `ctx.artisanId`.
export class SignatureNotificationWriterDrizzle implements SignatureNotificationWriter {
  constructor(private readonly db: DbClient) {}

  notify(
    ctx: TenantContext,
    notif: { type: SignatureNotificationType; titre: string; message: string; lien?: string },
  ): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.insert(notifications).values({
        artisanId: ctx.artisanId,
        type: notif.type,
        titre: notif.titre,
        message: notif.message,
        lien: notif.lien ?? null,
      });
    });
  }
}
