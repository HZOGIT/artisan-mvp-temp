import type { PortalPaymentReader } from "./portal-payment-reader";

export interface PaiementStatutResult {
  readonly factureId: number;
  readonly statutFacture: string;
  readonly montantTTC: string;
  readonly montantPaye: string | null;
  readonly datePaiement: Date | null;
  readonly modePaiement: string | null;
  readonly dernierPaiement: { statut: string; paidAt: Date | null } | null;
}

// Issue HTTP discriminée (mappée par le routeur). Parité legacy `/api/paiement/status/:factureId`.
export type PaiementStatutOutcome =
  | { readonly kind: "bad-request" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | { readonly kind: "ok"; readonly payload: PaiementStatutResult };

// Statut de paiement d'une facture via le token de portail (PUBLIC). Parité legacy : token absent →
// 400 ; accès portail inconnu/expiré → 403 ; facture inexistante/non rattachée au client de l'accès
// → 404 (anti-IDOR par l'accès portail) ; sinon le statut + le dernier paiement.
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
