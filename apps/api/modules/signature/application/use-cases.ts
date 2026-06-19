import { NotFoundError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
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

/** Dépendances injectées de la surface ARTISAN (protégée) du domaine signature. */
export interface SignatureDeps {
  readonly repo: ISignatureRepository;
  readonly contextReader: SignatureDevisContextReader;
  readonly email: EmailPort;
  readonly notifications: SignatureNotificationWriter;
  readonly appUrl: string;
  readonly maintenant?: () => Date;
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
    try {
      await deps.email.send({ to: client.email, subject, body });
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
