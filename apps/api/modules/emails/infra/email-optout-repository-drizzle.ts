import { eq } from "drizzle-orm";
import type { DbClient } from "../../../shared/db";
import { emailOptouts } from "../../../../../drizzle/schema.pg";
import type { IEmailOptoutRepository } from "../application/email-optout-repository";

export class EmailOptoutRepositoryDrizzle implements IEmailOptoutRepository {
  constructor(private readonly db: DbClient) {}

  async isOptedOut(email: string): Promise<boolean> {
    const [row] = await this.db.select({ id: emailOptouts.id }).from(emailOptouts).where(eq(emailOptouts.email, email)).limit(1);
    return row !== undefined;
  }

  async addOptout(email: string, reason?: string): Promise<void> {
    await this.db.insert(emailOptouts).values({ email, reason: reason ?? null }).onConflictDoNothing();
  }
}
