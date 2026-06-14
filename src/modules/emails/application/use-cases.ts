import type { TenantContext } from "../../../shared/tenant";
import type { EmailLogEntry, EmailLogFilter } from "../domain/email-log";
import type { IEmailLogReader } from "./email-log-reader";

// Journal d'emails du tenant (plus récents d'abord), filtré par entité. Scoping garanti par le reader.
export function listEmails(reader: IEmailLogReader, ctx: TenantContext, filter: EmailLogFilter = {}): Promise<EmailLogEntry[]> {
  return reader.list(ctx, filter);
}
