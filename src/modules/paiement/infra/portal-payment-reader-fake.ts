import type { TenantContext } from "../../../shared/tenant";
import type {
  PortalPaymentReader,
  PortalAccess,
  FacturePaiementStatut,
  DernierPaiement,
} from "../application/portal-payment-reader";

// Reader paiement portail fake (in-memory) pour les tests des use-cases.
export class FakePortalPaymentReader implements PortalPaymentReader {
  private access = new Map<string, PortalAccess>();
  private factures = new Map<string, FacturePaiementStatut>(); // clé `${artisanId}:${factureId}`
  private paiements = new Map<string, DernierPaiement>();

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
}
