/**
 * Module Connect — Stripe Connect (comptes artisans).
 * Lot 2 : webhook handler (account.updated / deauthorized) via owner pool.
 * Lot 1 (onboarding) complétera ce module avec le router tRPC.
 */
export type ConnectModule = Record<string, never>;

export function createConnectModule(): ConnectModule {
  return {};
}
