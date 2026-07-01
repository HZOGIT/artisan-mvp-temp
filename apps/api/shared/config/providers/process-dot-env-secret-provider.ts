import type { SecretProvider } from "./secret-provider";

/**
 * Provider par défaut (dev/staging) : `process.env` EST son magasin (seul endroit de la couche
 * secrets autorisé à lire `process.env`). `set()` est un NO-OP strict — on n'écrit jamais de
 * fichier `.env`. `load()` snapshot l'environnement dans le cache : c'est ce qui alimente les
 * lectures synchrones de boot (getSecretSync) en dev, sans que le résolveur ne touche `process.env`.
 */
export class ProcessDotEnvSecretProvider implements SecretProvider {
  readonly name = "process.env";

  get(key: string): Promise<string | undefined> {
    return Promise.resolve(process.env[key]);
  }

  set(): Promise<void> {
    /* ponytail: no-op strict — pas d'écriture de fichier ; le write-through cache du résolveur garde la valeur en mémoire pour la durée du process. */
    return Promise.resolve();
  }

  load(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) out[k] = v;
    }
    return Promise.resolve(out);
  }
}
