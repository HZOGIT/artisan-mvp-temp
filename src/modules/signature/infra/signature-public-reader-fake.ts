import type { TenantContext } from "../../../shared/tenant";
import type {
  SignaturePublicReader,
  SignatureTokenResolution,
  SignatureDevisView,
} from "../application/signature-public-reader";

// Reader public fake : on enregistre une résolution par token + une vue par (artisanId, devisId).
// `markDevisVu` est tracé pour les assertions de read-receipt.
export class FakeSignaturePublicReader implements SignaturePublicReader {
  private resolutions = new Map<string, SignatureTokenResolution>();
  private views = new Map<string, SignatureDevisView>();
  public markedVu: Array<{ artisanId: number; devisId: number }> = [];

  private viewKey(artisanId: number, devisId: number): string {
    return `${artisanId}:${devisId}`;
  }

  seedResolution(token: string, resolution: SignatureTokenResolution): void {
    this.resolutions.set(token, resolution);
  }

  seedView(artisanId: number, devisId: number, view: SignatureDevisView): void {
    this.views.set(this.viewKey(artisanId, devisId), view);
  }

  async resolveByToken(token: string): Promise<SignatureTokenResolution | null> {
    return this.resolutions.get(token) ?? null;
  }

  async getDevisView(ctx: TenantContext, devisId: number): Promise<SignatureDevisView | null> {
    return this.views.get(this.viewKey(ctx.artisanId, devisId)) ?? null;
  }

  async markDevisVu(ctx: TenantContext, devisId: number): Promise<void> {
    this.markedVu.push({ artisanId: ctx.artisanId, devisId });
  }
}
