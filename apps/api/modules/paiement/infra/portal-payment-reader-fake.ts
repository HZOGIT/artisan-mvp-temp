import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type {
  PortalPaymentReader,
  PortalAccess,
  FacturePaiementStatut,
  DernierPaiement,
  FactureCheckout,
  ClientContact,
} from "../application/portal-payment-reader";
import type { PortalPaymentWriter } from "../application/portal-payment-writer";

/** Reader paiement portail fake (in-memory) pour les tests des use-cases. */
export class FakePortalPaymentReader implements PortalPaymentReader {
  private access = new Map<string, PortalAccess>();
  /** clé `${artisanId}:${factureId}` */
  private factures = new Map<string, FacturePaiementStatut>();
  private paiements = new Map<string, DernierPaiement>();
  private checkouts = new Map<string, FactureCheckout>();
  private contacts = new Map<string, ClientContact>();
  private artisanNoms = new Map<number, string>();
  private sessionsEnAttente = new Map<string, { url: string | null; sessionId: string | null; createdAt: Date }>();
  /** Par défaut true pour ne pas casser les tests existants (Connect non concerné). */
  private artisanChargesEnabled = new Map<number, boolean>();
  private connectAccountIds = new Map<number, string>();
  /** Quand vrai, le premier appel à getSessionEnAttente retourne null (simule la race TOCTOU : session pas encore en DB). */
  skipFirstSessionLookup = false;
  private firstSessionLookupDone = false;

  seedCheckout(artisanId: number, factureId: number, f: FactureCheckout): void {
    this.checkouts.set(`${artisanId}:${factureId}`, f);
  }
  seedContact(artisanId: number, clientId: number, c: ClientContact): void {
    this.contacts.set(`${artisanId}:${clientId}`, c);
  }
  seedArtisanNom(artisanId: number, nom: string): void {
    this.artisanNoms.set(artisanId, nom);
  }
  seedArtisanChargesEnabled(artisanId: number, enabled: boolean): void {
    this.artisanChargesEnabled.set(artisanId, enabled);
  }
  seedArtisanConnectAccountId(artisanId: number, accountId: string): void {
    this.connectAccountIds.set(artisanId, accountId);
  }
  seedSessionEnAttente(artisanId: number, factureId: number, session: { url: string | null; sessionId?: string | null; createdAt?: Date }): void {
    this.sessionsEnAttente.set(`${artisanId}:${factureId}`, { url: session.url, sessionId: session.sessionId ?? null, createdAt: session.createdAt ?? new Date() });
  }

  seedAccess(token: string, a: PortalAccess): void {
    this.access.set(token, a);
  }
  seedFacture(artisanId: number, factureId: number, f: FacturePaiementStatut): void {
    this.factures.set(`${artisanId}:${factureId}`, f);
  }
  seedPaiement(artisanId: number, factureId: number, p: DernierPaiement): void {
    this.paiements.set(`${artisanId}:${factureId}`, p);
  }

  async resolveAccessByToken(token: string): Promise<PortalAccess | null> {
    return this.access.get(token) ?? null;
  }
  async getFactureStatut(ctx: TenantContext, factureId: number): Promise<FacturePaiementStatut | null> {
    return this.factures.get(`${ctx.artisanId}:${factureId}`) ?? null;
  }
  async getDernierPaiement(ctx: TenantContext, factureId: number): Promise<DernierPaiement | null> {
    return this.paiements.get(`${ctx.artisanId}:${factureId}`) ?? null;
  }
  async getFactureCheckout(ctx: TenantContext, factureId: number): Promise<FactureCheckout | null> {
    return this.checkouts.get(`${ctx.artisanId}:${factureId}`) ?? null;
  }
  async getClientContact(ctx: TenantContext, clientId: number): Promise<ClientContact | null> {
    return this.contacts.get(`${ctx.artisanId}:${clientId}`) ?? null;
  }
  async getArtisanNom(ctx: TenantContext): Promise<string | null> {
    return this.artisanNoms.get(ctx.artisanId) ?? null;
  }
  async getArtisanChargesEnabled(ctx: TenantContext): Promise<boolean> {
    return this.artisanChargesEnabled.get(ctx.artisanId) ?? true;
  }
  async getArtisanConnectAccountId(ctx: TenantContext): Promise<string | null> {
    return this.connectAccountIds.get(ctx.artisanId) ?? "acct_fake_test";
  }
  async getSessionEnAttente(ctx: TenantContext, factureId: number, now: Date): Promise<{ url: string | null; sessionId: string | null } | null> {
    if (this.skipFirstSessionLookup && !this.firstSessionLookupDone) {
      this.firstSessionLookupDone = true;
      return null;
    }
    const s = this.sessionsEnAttente.get(`${ctx.artisanId}:${factureId}`);
    if (!s) return null;
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return s.createdAt >= cutoff ? { url: s.url, sessionId: s.sessionId } : null;
  }
}

/** Writer paiement portail fake : collecte les paiements créés (assertions). */
export class FakePortalPaymentWriter implements PortalPaymentWriter {
  public created: Array<{ artisanId: number; factureId: number; stripeSessionId: string; tokenPaiement: string; stripeConnectAccountId?: string | null }> = [];
  /** Simule la violation UNIQUE PG (race TOCTOU) au premier appel si vrai. */
  public forceConflictOnce = false;
  async createPaiement(
    ctx: TenantContext,
    input: { factureId: number; stripeSessionId: string; montant: string; lienPaiement: string | null; tokenPaiement: string; stripeConnectAccountId?: string | null },
  ): Promise<void> {
    if (this.forceConflictOnce) {
      this.forceConflictOnce = false;
      throw new ConflictError("Session paiement déjà en cours pour cette facture");
    }
    this.created.push({ artisanId: ctx.artisanId, factureId: input.factureId, stripeSessionId: input.stripeSessionId, tokenPaiement: input.tokenPaiement, stripeConnectAccountId: input.stripeConnectAccountId });
  }
}
