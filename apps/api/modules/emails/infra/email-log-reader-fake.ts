import type { TenantContext } from "../../../shared/tenant";
import type { IEmailLogReader } from "../application/email-log-reader";
import { clampLimit } from "../domain/email-log";
import type { EmailLogEntry, EmailLogFilter } from "../domain/email-log";

/*
 * Lecteur fake déterministe : journal d'emails par tenant. Reproduit tri (createdAt desc), filtres
 * entité et bornage de limite.
 */
export class FakeEmailLogReader implements IEmailLogReader {
  private readonly entries = new Map<number, EmailLogEntry[]>();

  seed(artisanId: number, entries: EmailLogEntry[]): void {
    this.entries.set(artisanId, entries);
  }

  async list(ctx: TenantContext, filter: EmailLogFilter): Promise<EmailLogEntry[]> {
    let rows = (this.entries.get(ctx.artisanId) ?? []).filter((e) => e.artisanId === ctx.artisanId);
    if (filter.entiteType) rows = rows.filter((e) => e.entiteType === filter.entiteType);
    if (filter.entiteId !== undefined) rows = rows.filter((e) => e.entiteId === filter.entiteId);
    rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
    return rows.slice(0, clampLimit(filter.limit));
  }
}
