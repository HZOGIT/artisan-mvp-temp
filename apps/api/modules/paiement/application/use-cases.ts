import { randomUUID } from "crypto";
import type { StripePort } from "../../../shared/ports/stripe";
import type { TenantContext } from "../../../shared/tenant";
import type { PortalPaymentReader } from "./portal-payment-reader";
import type { PortalPaymentWriter } from "./portal-payment-writer";

export interface PaiementStatutResult {
  readonly factureId: number;
  readonly statutFacture: string;
  readonly montantTTC: string;
  readonly montantPaye: string | null;
  readonly datePaiement: Date | null;
  readonly modePaiement: string | null;
  readonly dernierPaiement: { statut: string; paidAt: Date | null } | null;
}

/** Issue HTTP discriminée (mappée par le routeur). Parité legacy `/api/paiement/status/:factureId`. */
export type PaiementStatutOutcome =
  | { readonly kind: "bad-request" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | { readonly kind: "ok"; readonly payload: PaiementStatutResult };

/*
 * Statut de paiement d'une facture via le token de portail (PUBLIC). Parité legacy : token absent →
 * 400 ; accès portail inconnu/expiré → 403 ; facture inexistante/non rattachée au client de l'accès
 * → 404 (anti-IDOR par l'accès portail) ; sinon le statut + le dernier paiement.
 */
export async function getPaiementStatut(
  reader: PortalPaymentReader,
  input: { token: string | undefined; factureId: number },
  now: Date = new Date(),
): Promise<PaiementStatutOutcome> {
  if (!input.token) return { kind: "bad-request" };
  const access = await reader.resolveAccessByToken(input.token, now);
  if (!access) return { kind: "forbidden" };

  const ctx = { artisanId: access.artisanId, userId: 0 };
  const facture = await reader.getFactureStatut(ctx, input.factureId);
  if (!facture || facture.clientId !== access.clientId) return { kind: "not-found" };

  const dernier = await reader.getDernierPaiement(ctx, input.factureId);
  return {
    kind: "ok",
    payload: {
      factureId: input.factureId,
      statutFacture: facture.statut,
      montantTTC: facture.totalTTC,
      montantPaye: facture.montantPaye,
      datePaiement: facture.datePaiement,
      modePaiement: facture.modePaiement,
      dernierPaiement: dernier ? { statut: dernier.statut, paidAt: dernier.paidAt } : null,
    },
  };
}

/** ── create-checkout-session ────────────────────────────────────────────────────────────────────── */
export interface CreateCheckoutDeps {
  readonly reader: PortalPaymentReader;
  readonly writer: PortalPaymentWriter;
  readonly stripe: StripePort;
  readonly maintenant?: () => Date;
}

export type CreateCheckoutOutcome =
  | { readonly kind: "bad-request"; readonly message: string }
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | { readonly kind: "ok"; readonly url: string | null; readonly sessionId: string };

const clientFullName = (c: { prenom: string | null; nom: string }): string => `${c.prenom ?? ""} ${c.nom}`.trim();

/*
 * `create-checkout-session` (parité legacy, PUBLIC par token portail) : ouvre un Checkout Stripe (mode
 * payment) pour qu'un client paie une facture. {factureId, token} requis sinon 400 ; accès portail
 * inconnu/expiré → 403 ; facture inexistante/d'un autre client → 404 (anti-IDOR) ; **garde paiement** :
 * statut `payee` → 400 (déjà payée), `brouillon`/`annulee` → 400 (non payable). Crée la ligne
 * `paiements_stripe` (en_attente) que le webhook soldera.
 */
export async function createInvoiceCheckout(
  deps: CreateCheckoutDeps,
  input: { factureId: number | undefined; token: string | undefined; origin: string },
): Promise<CreateCheckoutOutcome> {
  if (!input.factureId || !input.token) return { kind: "bad-request", message: "factureId et token requis" };
  const now = (deps.maintenant ?? (() => new Date()))();
  const access = await deps.reader.resolveAccessByToken(input.token, now);
  if (!access) return { kind: "forbidden" };

  const ctx: TenantContext = { artisanId: access.artisanId, userId: 0 };
  const facture = await deps.reader.getFactureCheckout(ctx, input.factureId);
  if (!facture || facture.clientId !== access.clientId) return { kind: "not-found" };
  if (facture.statut === "payee") return { kind: "bad-request", message: "Cette facture est déjà payée" };
  if (facture.statut === "brouillon" || facture.statut === "annulee") return { kind: "bad-request", message: "Cette facture n'est pas payable en ligne" };

  const sessionExistante = await deps.reader.getSessionEnAttente(ctx, input.factureId);
  if (sessionExistante) return { kind: "bad-request", message: "Un paiement est déjà en cours pour cette facture. Veuillez patienter ou contacter votre artisan." };

  const client = await deps.reader.getClientContact(ctx, access.clientId);
  const artisanNom = await deps.reader.getArtisanNom(ctx);
  if (!client) return { kind: "not-found" };

  const tokenPaiement = (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 32);
  const result = await deps.stripe.createInvoiceCheckout({
    factureId: input.factureId,
    numeroFacture: facture.numero ?? "",
    montantTTC: parseFloat(facture.totalTTC) || 0,
    clientEmail: client.email ?? "",
    clientName: clientFullName(client),
    artisanName: artisanNom ?? "Artisan",
    artisanId: access.artisanId,
    userId: access.clientId,
    origin: input.origin,
    tokenPaiement,
    portalToken: input.token,
  });

  await deps.writer.createPaiement(ctx, {
    factureId: input.factureId,
    stripeSessionId: result.sessionId,
    montant: facture.totalTTC,
    lienPaiement: result.url,
    tokenPaiement,
  });

  return { kind: "ok", url: result.url, sessionId: result.sessionId };
}
