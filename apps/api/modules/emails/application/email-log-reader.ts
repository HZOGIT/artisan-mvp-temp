import type { TenantContext } from "../../../shared/tenant";
import type { EmailLogEntry, EmailLogFilter } from "../domain/email-log";

/** Port de lecture du journal d'emails du tenant (RLS + filtre `artisanId`). Lecture seule. */
export interface IEmailLogReader {
  list(ctx: TenantContext, filter: EmailLogFilter): Promise<EmailLogEntry[]>;
}
