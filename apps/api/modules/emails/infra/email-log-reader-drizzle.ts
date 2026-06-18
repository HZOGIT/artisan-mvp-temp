import { and, desc, eq, type SQL } from "drizzle-orm";
import { emailsLog } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IEmailLogReader } from "../application/email-log-reader";
import { clampLimit } from "../domain/email-log";
import type { EmailLogEntry, EmailLogFilter } from "../domain/email-log";

type Row = typeof emailsLog.$inferSelect;

function toEntry(r: Row): EmailLogEntry {
  return {
    id: r.id,
    artisanId: r.artisanId ?? null,
    destinataire: r.destinataire,
    sujet: r.sujet,
    type: r.type ?? null,
    resendId: r.resendId ?? null,
    statut: r.statut,
    erreur: r.erreur ?? null,
    entiteType: r.entiteType ?? null,
    entiteId: r.entiteId ?? null,
    createdAt: r.createdAt,
  };
}

// Lecteur Drizzle du journal d'emails : scopé tenant (RLS via withTenant + filtre explicite
// `artisanId`), plus récents d'abord, limite bornée [1,500]. Aucune écriture.
export class EmailLogReaderDrizzle implements IEmailLogReader {
  constructor(private readonly db: DbClient) {}

  async list(ctx: TenantContext, filter: EmailLogFilter): Promise<EmailLogEntry[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const conds: SQL[] = [eq(emailsLog.artisanId, ctx.artisanId)];
      if (filter.entiteType) conds.push(eq(emailsLog.entiteType, filter.entiteType));
      if (filter.entiteId !== undefined) conds.push(eq(emailsLog.entiteId, filter.entiteId));
      const rows = await tx
        .select()
        .from(emailsLog)
        .where(and(...conds))
        .orderBy(desc(emailsLog.createdAt), desc(emailsLog.id))
        .limit(clampLimit(filter.limit));
      return rows.map(toEntry);
    });
  }
}
