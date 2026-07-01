import type { SecretProvider } from "./secret-provider";

/**
 * Structure minimale du client `@bitwarden/sdk-napi` réellement utilisée (le SDK est importé
 * dynamiquement pour ne pas peser sur le typecheck / le graphe de démarrage).
 */
interface BitwardenSecretsClient {
  list(organizationId: string): Promise<{ data: { id: string; key: string }[] }>;
  get(id: string): Promise<{ value: string }>;
  getByIds(ids: string[]): Promise<{ data: { key: string; value: string }[] }>;
  create(organizationId: string, key: string, value: string, note: string, projectIds: string[]): Promise<unknown>;
  update(organizationId: string, id: string, key: string, value: string, note: string, projectIds: string[]): Promise<unknown>;
}
interface BitwardenClientLike {
  auth(): { loginAccessToken(token: string): Promise<unknown> };
  secrets(): BitwardenSecretsClient;
}

/**
 * Provider Bitwarden Secrets Manager. Actif quand `BWS_ACCESS_TOKEN` est présent.
 * `set()` requiert `BWS_PROJECT_ID` (fail-closed clair sinon).
 */
export class BitwardenSecretProvider implements SecretProvider {
  readonly name = "bitwarden";
  private readonly token: string;
  private readonly orgId: string;
  private clientPromise: Promise<BitwardenClientLike> | null = null;

  constructor() {
    this.token = process.env.BWS_ACCESS_TOKEN ?? "";
    this.orgId = process.env.BWS_ORGANIZATION_ID ?? "";
  }

  private client(): Promise<BitwardenClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = (async (): Promise<BitwardenClientLike> => {
        const { BitwardenClient } = (await import("@bitwarden/sdk-napi")) as unknown as {
          BitwardenClient: new () => BitwardenClientLike;
        };
        const client = new BitwardenClient();
        await client.auth().loginAccessToken(this.token);
        return client;
      })();
    }
    return this.clientPromise;
  }

  private async idForKey(client: BitwardenClientLike, key: string): Promise<string | undefined> {
    const { data } = await client.secrets().list(this.orgId);
    return data.find((s) => s.key === key)?.id;
  }

  async get(key: string): Promise<string | undefined> {
    const client = await this.client();
    const id = await this.idForKey(client, key);
    if (!id) return undefined;
    return (await client.secrets().get(id)).value;
  }

  async set(key: string, value: string): Promise<void> {
    const projectId = process.env.BWS_PROJECT_ID;
    if (!projectId) {
      throw new Error("BWS_PROJECT_ID manquant — requis pour écrire un secret dans Bitwarden (set)");
    }
    const client = await this.client();
    const id = await this.idForKey(client, key);
    if (id) {
      await client.secrets().update(this.orgId, id, key, value, "", [projectId]);
    } else {
      await client.secrets().create(this.orgId, key, value, "", [projectId]);
    }
  }

  async load(): Promise<Record<string, string>> {
    const client = await this.client();
    const identifiers = (await client.secrets().list(this.orgId)).data;
    if (!identifiers.length) return {};
    const secrets = (await client.secrets().getByIds(identifiers.map((s) => s.id))).data;
    return Object.fromEntries(secrets.map((s) => [s.key, s.value]));
  }
}
