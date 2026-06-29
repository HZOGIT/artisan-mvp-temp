import type { TenantContext } from "../../../shared/tenant";

/**
 * Port d'écriture pour la sélection d'option de devis depuis le portail public.
 * L'implémentation Drizzle vit dans infra/ (hors couche application).
 */
export interface IPortalDevisOptionsWriter {
  /**
   * Vérifie l'appartenance anti-IDOR (option → devis.clientId === clientId),
   * réinitialise `selectionnee` sur toutes les options du devis puis sélectionne celle-ci.
   * Retourne le devisId si OK, null si IDOR rejeté.
   */
  selectOptionForClient(ctx: TenantContext, optionId: number, clientId: number): Promise<number | null>;
}
