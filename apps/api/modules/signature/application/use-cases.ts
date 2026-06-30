import { NotFoundError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { ArtisanReader, ClientReader } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";
import {
  generateSignatureToken,
  computeSignatureExpiry,
  buildSignatureLinkEmail,
} from "../domain/signature";
import type {
  ISignatureRepository,
  SignatureDevisContextReader,
  SignatureNotificationWriter,
} from "./signature-repository";
import type { IEmailLogWriter } from "../../emails/application/email-log-writer";

/** Dépendances injectées de la surface ARTISAN (protégée) du domaine signature. */
export interface SignatureDeps {
  readonly repo: ISignatureRepository;
  readonly contextReader: SignatureDevisContextReader;
  readonly email: EmailPort;
  readonly notifications: SignatureNotificationWriter;
  readonly appUrl: string;
  readonly maintenant?: () => Date;
  readonly emailLogWriter?: IEmailLogWriter;
  /** PDF joint au mail de signature — si l'un des quatre est absent, pas de PJ (dégradé silencieux). */
  readonly pdf?: PdfPort;
  readonly artisanReader?: ArtisanReader;
  readonly clientReader?: ClientReader;
  readonly lignesReader?: { listLignes(ctx: TenantContext, devisId: number): Promise<unknown[]> };
  readonly logger?: { warn(obj: Record<string, unknown>, msg: string): void };
}

/*
 * `signature.getSignatureByDevis` (parité legacy) : signature d'un devis DU TENANT. Anti-IDOR via le
 * devis parent — on lit d'abord le devis sous RLS ; s'il n'appartient pas au tenant → `null` (jamais
 * la signature d'un autre artisan). Lecture seule.
 */
export async function getSignatureByDevis(
  deps: SignatureDeps,
  ctx: TenantContext,
  devisId: number,
): Promise<Signature | null> {
  const context = await deps.contextReader.getDevisContext(ctx, devisId);
  /** devis inexistant ou hors tenant → pas de fuite */
  if (!context) return null;
  return deps.repo.getByDevisId(devisId);
}

/*
 * `signature.createSignatureLink` (parité legacy) : génère (ou renvoie, idempotent) le lien de
 * signature d'un devis du tenant, puis envoie l'email au client + crée une notification.
 * - Anti-IDOR : le devis doit appartenir au tenant (lecture RLS) sinon 404.
 * - Idempotent : si une signature existe déjà pour ce devis, on la renvoie sans rien recréer/renvoyer.
 * - Email/notification best-effort : l'email ne doit pas faire échouer la création du lien.
 */
export async function createSignatureLink(
  deps: SignatureDeps,
  ctx: TenantContext,
  devisId: number,
): Promise<Signature> {
  const context = await deps.contextReader.getDevisContext(ctx, devisId);
  if (!context) throw new NotFoundError("Devis non trouvé");

  /** Idempotence : ne pas recréer un lien (ni re-notifier) si la signature existe déjà. */
  const existing = await deps.repo.getByDevisId(devisId);
  if (existing) return existing;

  const now = (deps.maintenant ?? (() => new Date()))();
  const token = generateSignatureToken();
  const signature = await deps.repo.create({
    artisanId: ctx.artisanId,
    devisId,
    token,
    expiresAt: computeSignatureExpiry(now),
  });

  const { devis, client, artisan } = context;
  const signatureUrl = `${deps.appUrl}/devis-public/${token}`;

  /** Email au client (best-effort : un échec d'envoi ne casse pas la création du lien). */
  if (client?.email) {
    const clientName = `${client.prenom ?? ""} ${client.nom ?? ""}`.trim();
    const { subject, body } = buildSignatureLinkEmail({
      artisanName: artisan?.nomEntreprise ?? "",
      clientName,
      devisNumero: devis.numero,
      devisObjet: devis.objet,
      totalTTC: devis.totalTTC,
      signatureUrl,
    });

    /** PDF joint (best-effort : l'email part sans PJ si la génération échoue). */
    let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
    if (deps.pdf && deps.artisanReader && deps.clientReader && deps.lignesReader) {
      try {
        const [lignes, fullArtisan, fullClient] = await Promise.all([
          deps.lignesReader.listLignes(ctx, devis.id),
          deps.artisanReader.getArtisan(ctx),
          deps.clientReader.getClient(ctx, devis.clientId),
        ]);
        const buf = await deps.pdf.render("devis", { devis: { ...devis, lignes }, artisan: fullArtisan, client: fullClient });
        pdfAttachment = { filename: `Devis_${devis.numero}.pdf`, content: buf, contentType: "application/pdf" };
      } catch (err) {
        deps.logger?.warn({ err, devisId, event: "signature_email_pdf_error" }, "PDF devis non généré — email envoyé sans PJ");
      }
    }

    try {
      await deps.email.send({ to: client.email, subject, body, fromName: artisan?.nomEntreprise ?? undefined, replyTo: artisan?.email ?? undefined, ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}) });
      if (deps.emailLogWriter) {
        await deps.emailLogWriter.create({ artisanId: ctx.artisanId, destinataire: client.email, sujet: subject, type: "lien_signature", entiteType: "devis", entiteId: devisId }).catch(() => { /* ponytail: best-effort — emailLogWriter non-critique */ });
      }
    } catch {
      /* best-effort : le lien est créé même si l'email échoue */
    }
  }

  /** Notification artisan (best-effort). */
  try {
    await deps.notifications.notify(ctx, {
      type: "info",
      titre: "Devis envoyé pour signature",
      message: `Le devis ${devis.numero} a été envoyé à ${client?.email ?? "le client"} pour signature électronique`,
      lien: `/devis/${devisId}`,
    });
  } catch {
    /* best-effort */
  }

  return signature;
}
