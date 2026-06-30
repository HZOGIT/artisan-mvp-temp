import { and, eq, ne } from "drizzle-orm";
import { emailsLog } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IEmailLogWriter, CreateEmailLogEntry } from "../application/email-log-writer";

/*
 * Writer cross-tenant du journal d'emails. Réservé aux opérations système (webhook Resend) :
 * pas de withTenant — doit recevoir une connexion owner/superuser qui contourne la RLS.
 */
export class EmailLogWriterDrizzle implements IEmailLogWriter {
  constructor(private readonly db: DbClient) {}

  async updateStatutByResendId(
    resendId: string,
    statut: "delivre" | "bounce" | "plainte",
  ): Promise<{ artisanId: number | null; destinataire: string } | null> {
    const rows = await this.db
      .update(emailsLog)
      .set({ statut })
      .where(and(eq(emailsLog.resendId, resendId), ne(emailsLog.statut, statut)))
      .returning({ artisanId: emailsLog.artisanId, destinataire: emailsLog.destinataire });
    return rows[0] ?? null;
  }

  async create(entry: CreateEmailLogEntry): Promise<void> {
    await this.db.insert(emailsLog).values({
      artisanId: entry.artisanId,
      destinataire: entry.destinataire,
      sujet: entry.sujet,
      type: entry.type,
      resendId: entry.resendId ?? null,
      statut: entry.statut ?? "sent",
      entiteType: entry.entiteType ?? null,
      entiteId: entry.entiteId ?? null,
    });
  }
}
