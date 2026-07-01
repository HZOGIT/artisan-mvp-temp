import type { SecretProvider } from "./secret-provider";

/**
 * Provider OVHcloud Secret Manager (OKMS) — provider de PROD.
 *
 * L'API est compatible HashiCorp Vault KV v2 (documenté OVH, "Secret Manager KV v2 API") :
 *   - endpoint : https://<region>.okms.ovh.net/api/<okms_id>   (variable OVH_SECRET_MANAGER_ENDPOINT)
 *   - auth     : Personal Access Token (PAT) envoyé en header `X-Vault-Token` (variable OVH_SECRET_MANAGER_TOKEN)
 *   - lire     : GET  {endpoint}/v1/secret/data/{path}  → { data: { data: {k:v}, metadata: { version } } }
 *   - écrire   : POST {endpoint}/v1/secret/data/{path}  body { data: {k:v}, options: { cas: <version> } }
 *
 * Modèle de stockage : TOUS les secrets applicatifs sont regroupés dans UN seul secret KV2
 * (une "version" = un objet plat clé→valeur) au chemin OVH_SECRET_MANAGER_PATH (défaut "operioz").
 * `load()`/`get()` = une seule lecture ; `set()` = lecture + merge + écriture (préserve les autres clés).
 *
 * Aucune dépendance ajoutée : simple `fetch` (Node global). Vault KV2 est un contrat stable.
 */
export class OvhSecretsManagerProvider implements SecretProvider {
  readonly name = "ovh";
  private readonly endpoint: string;
  private readonly token: string;
  private readonly path: string;

  constructor() {
    this.endpoint = (process.env.OVH_SECRET_MANAGER_ENDPOINT ?? "").replace(/\/$/, "");
    this.token = process.env.OVH_SECRET_MANAGER_TOKEN ?? "";
    this.path = process.env.OVH_SECRET_MANAGER_PATH ?? "operioz";
  }

  private dataUrl(): string {
    if (!this.endpoint || !this.token) {
      throw new Error(
        "OVH_SECRET_MANAGER_ENDPOINT / OVH_SECRET_MANAGER_TOKEN manquant(s) — requis pour le provider OVH Secret Manager",
      );
    }
    return `${this.endpoint}/v1/secret/data/${this.path}`;
  }

  /** Lit le secret KV2 agrégé. Renvoie l'objet plat clé→valeur + la version courante (0 si absent). */
  private async read(): Promise<{ data: Record<string, string>; version: number }> {
    const res = await fetch(this.dataUrl(), { headers: { "X-Vault-Token": this.token } });
    if (res.status === 404) return { data: {}, version: 0 };
    if (!res.ok) {
      throw new Error(`OVH Secret Manager: lecture échouée (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { data?: { data?: Record<string, string>; metadata?: { version?: number } } };
    return { data: body.data?.data ?? {}, version: body.data?.metadata?.version ?? 0 };
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.read()).data[key];
  }

  async set(key: string, value: string): Promise<void> {
    const current = await this.read();
    const merged = { ...current.data, [key]: value };
    /* ponytail: read-merge-write sans verrou distribué (cas = version lue) ; set() est rare (bootstrap), collision négligeable — le cas Vault rejette une écriture concurrente périmée. */
    const res = await fetch(this.dataUrl(), {
      method: "POST",
      headers: { "X-Vault-Token": this.token, "Content-Type": "application/json" },
      body: JSON.stringify({ data: merged, options: { cas: current.version } }),
    });
    if (!res.ok) {
      throw new Error(`OVH Secret Manager: écriture échouée (HTTP ${res.status})`);
    }
  }

  async load(): Promise<Record<string, string>> {
    return (await this.read()).data;
  }
}
