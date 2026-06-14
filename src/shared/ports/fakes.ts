// Implémentations en mémoire des ports, pour les tests (use-cases sans infra réelle).
import type { EmailPort, EmailMessage } from "./email";
import type { SmsPort, SmsMessage } from "./sms";
import type { StoragePort, PutOptions } from "./storage";
import type { PdfPort } from "./pdf";
import type { RateLimiterPort } from "./rate-limiter";
import type { LlmPort } from "./llm";
import type { VisionPort, VisionRequest } from "./vision";

export class FakeEmailPort implements EmailPort {
  readonly sent: EmailMessage[] = [];
  private failNext = false;
  failOnce(): void {
    this.failNext = true;
  }
  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("envoi email simulé en échec");
    }
    this.sent.push(message);
  }
}

// Limiteur de débit factice : autorise tout par défaut ; `denyKey(key)` fait échouer
// la prochaine vérification de cette clé. Mémorise les clés vérifiées (assertions).
export class FakeRateLimiter implements RateLimiterPort {
  readonly checked: string[] = [];
  private denied = new Set<string>();
  denyKey(key: string): void {
    this.denied.add(key);
  }
  async check(key: string): Promise<boolean> {
    this.checked.push(key);
    return !this.denied.has(key);
  }
}

export class FakeSmsPort implements SmsPort {
  readonly sent: SmsMessage[] = [];
  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class InMemoryStoragePort implements StoragePort {
  private readonly store = new Map<string, { body: Buffer; contentType?: string }>();
  async put(key: string, body: Buffer, opts?: PutOptions): Promise<void> {
    this.store.set(key, { body, contentType: opts?.contentType });
  }
  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key)?.body ?? null;
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async url(key: string): Promise<string> {
    return `memory://${key}`;
  }
}

export class FakePdfPort implements PdfPort {
  readonly rendered: Array<{ template: string; data: Record<string, unknown> }> = [];
  async render(template: string, data: Record<string, unknown>): Promise<Buffer> {
    this.rendered.push({ template, data });
    return Buffer.from(`PDF<${template}>${JSON.stringify(data)}`);
  }
}

// LLM factice déterministe : renvoie une réponse scriptée et mémorise les prompts (assertions).
// Aucun appel réseau. `responses` = une réponse fixe, ou une file (une par appel `complete`/`stream`).
export class FakeLlmPort implements LlmPort {
  readonly prompts: string[] = [];
  private readonly queue: string[];
  constructor(responses: string | string[] = "réponse simulée") {
    this.queue = Array.isArray(responses) ? [...responses] : [responses];
  }
  private next(): string {
    // File à plusieurs entrées → consomme ; sinon réponse fixe réutilisée.
    return this.queue.length > 1 ? this.queue.shift()! : this.queue[0] ?? "";
  }
  async complete(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.next();
  }
  async *stream(prompt: string): AsyncIterable<string> {
    this.prompts.push(prompt);
    const text = this.next();
    // Découpe en fragments pour simuler le flux (concaténés = texte complet).
    for (const part of text.match(/[\s\S]{1,8}/g) ?? [text]) yield part;
  }
}

// Vision factice déterministe : renvoie une réponse scriptée et capture les requêtes (assertions).
// Aucun appel réseau. `responses` = réponse fixe ou file (une par appel). `throwOn` force une erreur.
export class FakeVisionPort implements VisionPort {
  readonly requests: VisionRequest[] = [];
  private readonly queue: string[];
  private readonly err?: Error;
  constructor(responses: string | string[] = "{}", opts?: { throwError?: Error }) {
    this.queue = Array.isArray(responses) ? [...responses] : [responses];
    this.err = opts?.throwError;
  }
  async analyzeImage(req: VisionRequest): Promise<string> {
    this.requests.push(req);
    if (this.err) throw this.err;
    return this.queue.length > 1 ? this.queue.shift()! : this.queue[0] ?? "";
  }
}
