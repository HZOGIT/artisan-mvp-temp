import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";
import type {
  SignaturePublicReader,
  SignatureTokenResolution,
  SignatureDevisView,
} from "../application/signature-public-reader";
import type {
  SignaturePublicWriter,
  SignDevisInput,
  RefuseDevisInput,
} from "../application/signature-public-writer";

/*
 * Reader public fake : on enregistre une résolution par token + une vue par (artisanId, devisId).
 * `markDevisVu` est tracé pour les assertions de read-receipt.
 */
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

/*
 * Writer public fake : applique les transitions sur des signatures en mémoire (garde `en_attente`)
 * + options. Sert aux tests des use-cases de mutation publique.
 */
export class FakeSignaturePublicWriter implements SignaturePublicWriter {
  private signatures = new Map<string, Signature>();
  /** optionId → devisId (ownership) ; sélection courante par devisId. */
  private optionOwner = new Map<number, number>();
  public selected: Array<{ devisId: number; optionId: number }> = [];

  seedSignature(sig: Signature): void {
    this.signatures.set(sig.token, sig);
  }
  seedOption(optionId: number, devisId: number): void {
    this.optionOwner.set(optionId, devisId);
  }

  async signDevis(_ctx: TenantContext, input: SignDevisInput): Promise<Signature> {
    const sig = this.signatures.get(input.token);
    if (!sig) throw new Error("not found");
    /** garde immutabilité */
    if (sig.statut !== "en_attente") return sig;
    const updated: Signature = {
      ...sig,
      statut: "accepte",
      signatureData: input.signatureData,
      signataireName: input.signataireName,
      signataireEmail: input.signataireEmail,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      signedAt: new Date(),
      documentHash: input.documentHash,
      documentHashedAt: input.documentHashedAt,
    };
    this.signatures.set(input.token, updated);
    return updated;
  }

  async refuseDevis(_ctx: TenantContext, input: RefuseDevisInput): Promise<Signature> {
    const sig = this.signatures.get(input.token);
    if (!sig) throw new Error("not found");
    if (sig.statut !== "en_attente") return sig;
    const updated: Signature = {
      ...sig,
      statut: "refuse",
      motifRefus: input.motifRefus,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      signedAt: new Date(),
    };
    this.signatures.set(input.token, updated);
    return updated;
  }

  async getOptionDevisId(_ctx: TenantContext, optionId: number): Promise<number | null> {
    return this.optionOwner.get(optionId) ?? null;
  }

  async selectOption(_ctx: TenantContext, devisId: number, optionId: number): Promise<void> {
    this.selected.push({ devisId, optionId });
  }
}
