/** Statut de la connexion Stripe Connect d'un artisan. */
export type ConnectStatus = "none" | "pending" | "active" | "restricted" | "deauthorized";

export function deriveConnectStatus(chargesEnabled: boolean, detailsSubmitted: boolean): ConnectStatus {
  if (chargesEnabled) return "active";
  if (detailsSubmitted) return "restricted";
  return "pending";
}
