/**
 * Contrat commun des fournisseurs de secrets. Un provider expose la valeur LIVE d'un secret
 * chez sa source (coffre distant ou process.env), sait l'écrire, et sait précharger l'ensemble
 * des secrets au boot pour réchauffer le cache mémoire du résolveur.
 */
export interface SecretProvider {
  /** Identifiant lisible (logs, sélection). */
  readonly name: string;
  /** Valeur LIVE du secret chez le provider, ou undefined si absent. */
  get(key: string): Promise<string | undefined>;
  /** Crée ou met à jour le secret chez le provider. */
  set(key: string, value: string): Promise<void>;
  /** Précharge tous les secrets accessibles (warm cache au boot). */
  load(): Promise<Record<string, string>>;
}
