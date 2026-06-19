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

  seedCheckout(artisanId: number, factureId: number, f: FactureCheckout): void {
    this.checkouts.set(`${artisanId}:${factureId}`, f);
  }
  seedContact(artisanId: number, clientId: number, c: ClientContact): void {
    this.contacts.set(`${artisanId}:${clientId}`, c);
  }
  seedArtisanNom(artisanId: number, nom: string): void {
    this.artisanNoms.set(artisanId, nom);
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
}

/** Writer paiement portail fake : collecte les paiements créés (assertions). */
export class FakePortalPaymentWriter implements PortalPaymentWriter {
  public created: Array<{ artisanId: number; factureId: number; stripeSessionId: string; tokenPaiement: string }> = [];
  async createPaiement(
    ctx: TenantContext,
    input: { factureId: number; stripeSessionId: string; montant: string; lienPaiement: string | null; tokenPaiement: string },
  ): Promise<void> {
    this.created.push({ artisanId: ctx.artisanId, factureId: input.factureId, stripeSessionId: input.stripeSessionId, tokenPaiement: input.tokenPaiement });
  }
}
