import type { TenantContext } from "../../../shared/tenant";
import type { Signature, NewSignature } from "../domain/signature";
import type {
  ISignatureRepository,
  SignatureDevisContext,
  SignatureDevisContextReader,
  SignatureNotificationWriter,
  SignatureNotificationType,
} from "../application/signature-repository";

/** Repo en mémoire pour les tests (sans RLS, comme la vraie table). */
export class FakeSignatureRepository implements ISignatureRepository {
  private rows: Signature[] = [];
  private seq = 1;

  async getByDevisId(devisId: number): Promise<Signature | null> {
    return this.rows.find((s) => s.devisId === devisId) ?? null;
  }

  async getByToken(token: string): Promise<Signature | null> {
    return this.rows.find((s) => s.token === token) ?? null;
  }

  async create(data: NewSignature): Promise<Signature> {
    const sig: Signature = {
      id: this.seq++,
      devisId: data.devisId,
      token: data.token,
      statut: "en_attente",
      signatureData: null,
      signataireName: null,
      signataireEmail: null,
      ipAddress: null,
      userAgent: null,
      motifRefus: null,
      signedAt: null,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.rows.push(sig);
    return sig;
  }
}

/*
 * Reader de contexte fake : on enregistre le contexte par (artisanId, devisId). Renvoie `null` si le
 * devis n'a pas été semé pour ce tenant → simule l'anti-IDOR du parent.
 */
export class FakeSignatureContextReader implements SignatureDevisContextReader {
  private byKey = new Map<string, SignatureDevisContext>();

  private key(artisanId: number, devisId: number): string {
    return `${artisanId}:${devisId}`;
  }

  seed(artisanId: number, ctx: SignatureDevisContext): void {
    this.byKey.set(this.key(artisanId, ctx.devis.id), ctx);
  }

  async getDevisContext(ctx: TenantContext, devisId: number): Promise<SignatureDevisContext | null> {
    return this.byKey.get(this.key(ctx.artisanId, devisId)) ?? null;
  }
}

/** Notification writer fake : collecte les notifications émises pour assertions. */
export class FakeSignatureNotificationWriter implements SignatureNotificationWriter {
  public emitted: Array<{ artisanId: number; type: SignatureNotificationType; titre: string; message: string; lien?: string }> = [];

  async notify(
    ctx: TenantContext,
    notif: { type: SignatureNotificationType; titre: string; message: string; lien?: string },
  ): Promise<void> {
    this.emitted.push({ artisanId: ctx.artisanId, ...notif });
  }
}
