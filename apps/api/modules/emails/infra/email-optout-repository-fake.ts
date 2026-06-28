import type { IEmailOptoutRepository } from "../application/email-optout-repository";

export class EmailOptoutRepositoryFake implements IEmailOptoutRepository {
  private readonly optouts = new Set<string>();

  seed(email: string): void {
    this.optouts.add(email.toLowerCase());
  }

  async isOptedOut(email: string): Promise<boolean> {
    return this.optouts.has(email.toLowerCase());
  }

  async addOptout(email: string): Promise<void> {
    this.optouts.add(email.toLowerCase());
  }
}
