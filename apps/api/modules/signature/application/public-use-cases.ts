import { createHash } from "node:crypto";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";
import { buildSignedDevisArtisanEmail, buildRefusedDevisArtisanEmail } from "../domain/signature";
import type { SignaturePublicReader, SignatureDevisView } from "./signature-public-reader";
import type { SignaturePublicWriter } from "./signature-public-writer";
import type { SignatureNotificationWriter } from "./signature-repository";
import type { EventBusPort } from "../../../shared/ports/event-bus";

/** Dépendances de la surface PUBLIQUE par token (portail de signature). */
export interface SignaturePublicDeps {
  readonly reader: SignaturePublicReader;
  readonly writer: SignaturePublicWriter;
  readonly rateLimiter: RateLimiterPort;
  readonly notifications: SignatureNotificationWriter;
  readonly email: EmailPort;
  readonly maintenant?: () => Date;
  readonly eventBus?: EventBusPort;
}

const clientFullName = (client: { prenom: string | null; nom: string } | null): string =>
  client ? `${client.prenom ?? ""} ${client.nom}`.trim() : "Le client";

export interface DevisForSignature extends SignatureDevisView {
  readonly signature: Signature;
}

/*
 * `signature.getDevisForSignature` (parité legacy, PUBLIC par token) : affiche le devis à signer.
 * - token inconnu → 404 (anti-oracle : message uniforme « invalide ou expiré »).
 * - **lien expiré ET toujours en_attente → 400** (un devis déjà signé/refusé reste consultable).
 * - read-receipt `markDevisVu` best-effort (1ʳᵉ consultation), n'altère jamais la réponse.
 * Les sous-ressources (client/artisan/lignes/options) sont lues SOUS LE TENANT résolu via le token.
 */
export async function getDevisForSignature(
  deps: SignaturePublicDeps,
  token: string,
): Promise<DevisForSignature> {
  const resolution = await deps.reader.resolveByToken(token);
  if (!resolution) throw new NotFoundError("Lien de signature invalide ou expiré");

  const now = (deps.maintenant ?? (() => new Date()))();
  if (now > resolution.signature.expiresAt && resolution.signature.statut === "en_attente") {
    throw new ValidationError("Ce lien de signature a expiré");
  }

  const ctx: TenantContext = { artisanId: resolution.artisanId, userId: 0 };

  /** Read-receipt : marque le devis « vu » à la 1ʳᵉ consultation (idempotent + best-effort). */
  if (!resolution.dateVue) {
    try {
      await deps.reader.markDevisVu(ctx, resolution.devisId);
    } catch {
      /* best-effort : ne casse jamais l'affichage */
    }
  }

  const view = await deps.reader.getDevisView(ctx, resolution.devisId);
  if (!view) throw new NotFoundError("Devis non trouvé");

  return { ...view, signature: resolution.signature };
}

/** Contexte tenant résolu par le token (artisanId fictif userId=0, le token EST la capacité). */
function tenantOf(artisanId: number): TenantContext {
  return { artisanId, userId: 0 };
}

/**
 * Représentation canonique déterministe du contenu d'un devis → SHA-256 hex (64 car.).
 * Sert de preuve d'intégrité : le hash lié à la signature permet de vérifier que le contenu
 * n'a pas changé depuis l'acceptation (lignes triées par ordre, champs stables).
 */
export function computeDevisHash(view: SignatureDevisView): string {
  const sortLignes = (lignes: readonly SignatureDevisView["lignes"][number][]) =>
    [...lignes].sort((a, b) => a.ordre - b.ordre).map((l) => ({
      ordre: l.ordre,
      designation: l.designation,
      description: l.description ?? null,
      quantite: l.quantite,
      unite: l.unite ?? null,
      prixUnitaireHT: l.prixUnitaireHT,
      tauxTVA: l.tauxTVA,
      montantHT: l.montantHT,
      montantTTC: l.montantTTC,
    }));
  const canonical = {
    devis: {
      numero: view.devis.numero,
      objet: view.devis.objet ?? null,
      dateValidite: view.devis.dateValidite?.toISOString() ?? null,
      conditionsPaiement: view.devis.conditionsPaiement ?? null,
      totalHT: view.devis.totalHT,
      totalTVA: view.devis.totalTVA,
      totalTTC: view.devis.totalTTC,
    },
    lignes: sortLignes(view.lignes),
    options: [...view.options]
      .sort((a, b) => a.ordre - b.ordre)
      .map((o) => ({
        ordre: o.ordre,
        nom: o.nom,
        description: o.description ?? null,
        selectionnee: o.selectionnee,
        totalHT: o.totalHT,
        totalTTC: o.totalTTC,
        lignes: sortLignes(o.lignes),
      })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/*
 * `signature.selectDevisOption` (PUBLIC) : le client choisit une option/variante AVANT de signer.
 * - token inconnu → 404 ; **déjà signé (`signedAt`) → 400** ; expiré → 400.
 * - l'option doit appartenir AU devis de la signature (sinon 404, anti-IDOR).
 * - anti-flood : rate-limit par signature (`sig:<id>`).
 */
export async function selectDevisOption(
  deps: SignaturePublicDeps,
  input: { token: string; optionId: number },
): Promise<{ success: boolean; optionId: number }> {
  const resolution = await deps.reader.resolveByToken(input.token);
  if (!resolution) throw new NotFoundError("Lien de signature invalide");
  if (resolution.signature.signedAt) throw new ValidationError("Ce devis a déjà été signé");
  const now = (deps.maintenant ?? (() => new Date()))();
  if (now > resolution.signature.expiresAt) throw new ValidationError("Ce lien a expiré");

  const ctx = tenantOf(resolution.artisanId);
  const ownerDevisId = await deps.writer.getOptionDevisId(ctx, input.optionId);
  if (ownerDevisId === null || ownerDevisId !== resolution.devisId) {
    throw new NotFoundError("Option non trouvée");
  }
  if (!(await deps.rateLimiter.check(`sig:${resolution.signature.id}`))) {
    throw new TooManyRequestsError("Trop de requêtes. Réessayez dans quelques minutes.");
  }
  await deps.writer.selectOption(ctx, resolution.devisId, input.optionId);
  return { success: true, optionId: input.optionId };
}

/*
 * `signature.signDevis` (PUBLIC) : le client signe le devis.
 * - token inconnu → 404 ; **statut ≠ `en_attente` → 400** (immutabilité/anti-rejeu) ; expiré → 400.
 * - capture IP probante + UA (résolus au routeur depuis ctx) ; signatures_devis→accepte ET devis→accepte
 *   en transaction sous le tenant (garde SQL `statut='en_attente'`).
 * - notification + email artisan best-effort (ne casse pas la signature).
 */
export async function signDevis(
  deps: SignaturePublicDeps,
  input: {
    token: string;
    signatureData: string;
    signataireName: string;
    signataireEmail: string;
    ipAddress: string;
    userAgent: string;
  },
): Promise<{ success: boolean; signature: Signature }> {
  const resolution = await deps.reader.resolveByToken(input.token);
  if (!resolution) throw new NotFoundError("Lien de signature invalide");
  if (resolution.signature.statut !== "en_attente") {
    throw new ValidationError("Ce devis a déjà été traité");
  }
  const now = (deps.maintenant ?? (() => new Date()))();
  if (now > resolution.signature.expiresAt) throw new ValidationError("Ce lien de signature a expiré");
  if (resolution.devisDateValidite && now > resolution.devisDateValidite) {
    const exp = resolution.devisDateValidite.toLocaleDateString("fr-FR");
    throw new ValidationError(`Ce devis a expiré le ${exp} — demandez un nouveau devis à votre artisan`);
  }

  if (!(await deps.rateLimiter.check(`sign:${resolution.signature.id}`))) {
    throw new TooManyRequestsError("Trop de tentatives. Réessayez dans quelques minutes.");
  }

  const ctx = tenantOf(resolution.artisanId);

  const signView = await deps.reader.getDevisView(ctx, resolution.devisId).catch(() => null);
  const documentHash = signView ? computeDevisHash(signView) : null;
  const documentHashedAt = documentHash ? now : null;

  const signature = await deps.writer.signDevis(ctx, {
    token: input.token,
    devisId: resolution.devisId,
    signatureData: input.signatureData,
    signataireName: input.signataireName,
    signataireEmail: input.signataireEmail,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    documentHash,
    documentHashedAt,
  });

  await deps.eventBus?.publish({ type: "SIGNATURE_COMPLETE", aggregateId: String(resolution.devisId), aggregateType: "devis", payload: { devisId: resolution.devisId, artisanId: resolution.artisanId }, occurredAt: new Date() }).catch(() => {});

  await notifyArtisanBestEffort(deps, ctx, resolution.devisId, async (view) => {
    await deps.notifications.notify(ctx, {
      type: "succes",
      titre: "Devis signé !",
      message: `Le devis ${view.devis.numero} a été accepté et signé par ${input.signataireName}`,
      lien: `/devis/${resolution.devisId}`,
    });
    if (view.artisan?.email) {
      const { subject, body } = buildSignedDevisArtisanEmail({
        devisNumero: view.devis.numero,
        signataireName: input.signataireName,
        signataireEmail: input.signataireEmail,
      });
      /* ponytail: double-send temporaire — workers pg-boss prendront le relais */
      await deps.email.send({ to: view.artisan.email, subject, body });
    }
  });

  return { success: true, signature };
}

/** `signature.refuseDevis` (PUBLIC) : le client refuse le devis (+ motif optionnel). */
export async function refuseDevis(
  deps: SignaturePublicDeps,
  input: { token: string; motifRefus: string | null; ipAddress: string; userAgent: string },
): Promise<{ success: boolean; signature: Signature }> {
  const resolution = await deps.reader.resolveByToken(input.token);
  if (!resolution) throw new NotFoundError("Lien de signature invalide");
  if (resolution.signature.statut !== "en_attente") {
    throw new ValidationError("Ce devis a déjà été traité");
  }

  if (!(await deps.rateLimiter.check(`refuse:${resolution.signature.id}`))) {
    throw new TooManyRequestsError("Trop de tentatives. Réessayez dans quelques minutes.");
  }

  const ctx = tenantOf(resolution.artisanId);
  const signature = await deps.writer.refuseDevis(ctx, {
    token: input.token,
    devisId: resolution.devisId,
    motifRefus: input.motifRefus,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await notifyArtisanBestEffort(deps, ctx, resolution.devisId, async (view) => {
    const clientName = clientFullName(view.client);
    const motifSuffix = input.motifRefus ? ` — Motif : ${input.motifRefus}` : "";
    await deps.notifications.notify(ctx, {
      type: "alerte",
      titre: "Devis refusé",
      message: `Le devis ${view.devis.numero} a été refusé par ${clientName}${motifSuffix}`,
      lien: `/devis/${resolution.devisId}`,
    });
    if (view.artisan?.email) {
      const { subject, body } = buildRefusedDevisArtisanEmail({
        devisNumero: view.devis.numero,
        clientName,
        motifRefus: input.motifRefus,
      });
      await deps.email.send({ to: view.artisan.email, subject, body });
    }
  });

  return { success: true, signature };
}

/*
 * Notifie l'artisan (notification + email) après sign/refuse — **best-effort** : un échec (vue
 * introuvable, email KO) n'altère jamais le résultat de la mutation déjà persistée.
 */
async function notifyArtisanBestEffort(
  deps: SignaturePublicDeps,
  ctx: TenantContext,
  devisId: number,
  effect: (view: SignatureDevisView) => Promise<void>,
): Promise<void> {
  try {
    const view = await deps.reader.getDevisView(ctx, devisId);
    if (view) await effect(view);
  } catch {
    /* best-effort */
  }
}
