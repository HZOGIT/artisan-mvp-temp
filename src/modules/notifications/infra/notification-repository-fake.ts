import type { TenantContext } from "../../../shared/tenant";
import type { INotificationRepository } from "../application/notification-repository";
import type { Notification, ListNotificationsOptions } from "../domain/notification";

// Entrée de seed pour les tests (les notifications naissent côté serveur/scheduler).
export interface SeedNotificationInput {
  readonly artisanId: number;
  readonly titre: string;
  readonly type?: Notification["type"];
  readonly message?: string | null;
  readonly lu?: boolean;
  readonly archived?: boolean;
}

const LIMIT_MAX = 100;
const PAGE_MAX = 100000;

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant + les filtres/pagination + l'anti-IDOR (markAsRead/archive hors tenant → false).
export class FakeNotificationRepository implements INotificationRepository {
  private store: Notification[] = [];
  private seq = 0;

  // Utilitaire de test (hors port) : insère une notification d'un tenant.
  seed(input: SeedNotificationInput): Notification {
    const n: Notification = {
      id: ++this.seq,
      artisanId: input.artisanId,
      type: input.type ?? "info",
      titre: input.titre,
      message: input.message ?? null,
      lien: null,
      lu: input.lu ?? false,
      archived: input.archived ?? false,
      createdAt: new Date(Date.now() + this.seq), // ordre stable d'insertion
    };
    this.store.push(n);
    return n;
  }

  async list(ctx: TenantContext, options?: ListNotificationsOptions): Promise<Notification[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), LIMIT_MAX);
    const page = Math.min(Math.max(options?.page ?? 1, 1), PAGE_MAX);
    const offset = (page - 1) * limit;
    const filtered = this.store
      .filter((n) => n.artisanId === ctx.artisanId)
      .filter((n) => (options?.includeArchived ? true : !n.archived))
      .filter((n) => (options?.nonLuesUniquement ? !n.lu : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
    return filtered.slice(offset, offset + limit);
  }

  async countUnread(ctx: TenantContext): Promise<number> {
    return this.store.filter((n) => n.artisanId === ctx.artisanId && !n.lu && !n.archived).length;
  }

  async markAsRead(ctx: TenantContext, id: number): Promise<boolean> {
    const n = this.store.find((x) => x.id === id && x.artisanId === ctx.artisanId);
    if (!n) return false;
    this.store = this.store.map((x) => (x.id === id ? { ...x, lu: true } : x));
    return true;
  }

  async markAllAsRead(ctx: TenantContext): Promise<number> {
    let count = 0;
    this.store = this.store.map((x) => {
      if (x.artisanId === ctx.artisanId && !x.lu) {
        count++;
        return { ...x, lu: true };
      }
      return x;
    });
    return count;
  }

  async archive(ctx: TenantContext, id: number): Promise<boolean> {
    const n = this.store.find((x) => x.id === id && x.artisanId === ctx.artisanId);
    if (!n) return false;
    this.store = this.store.map((x) => (x.id === id ? { ...x, archived: true } : x));
    return true;
  }
}
