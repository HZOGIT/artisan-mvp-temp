import { eq } from "drizzle-orm";
import { emailsLog } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IEmailLogWriter } from "../application/email-log-writer";

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
      .where(eq(emailsLog.resendId, resendId))
      .returning({ artisanId: emailsLog.artisanId, destinataire: emailsLog.destinataire });
    return rows[0] ?? null;
  }
}
