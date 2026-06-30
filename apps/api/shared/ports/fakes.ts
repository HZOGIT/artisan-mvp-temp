/** Implémentations en mémoire des ports, pour les tests (use-cases sans infra réelle). */
import type { EmailPort, EmailMessage } from "./email";
import type { SmsPort, SmsMessage } from "./sms";
import type { StoragePort, StoredFile, UploadOptions } from "./storage";
import type { DbClient } from "../db";
import { createHash } from "crypto";
import type { PdfPort } from "./pdf";
import type { RateLimiterPort } from "./rate-limiter";
import type { LlmPort, LlmResult, LlmStreamChunk, LlmUsage } from "./llm";
import type { EventBusPort, WorkerPort, DomainEvent } from "./event-bus";

const FAKE_USAGE: LlmUsage = {
  model: "fake", durationMs: 0, finishReason: "STOP",
  promptTokens: 0, responseTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, totalTokens: 0,
  textInputTokens: 0, audioInputTokens: 0, imageInputTokens: 0, videoInputTokens: 0,
  textOutputTokens: 0, audioOutputTokens: 0, trafficType: null,
};
import type { VisionPort, VisionRequest, VisionMultiRequest } from "./vision";

export class FakeEmailPort implements EmailPort {
  readonly sent: EmailMessage[] = [];
  private failNext = false;
  failOnce(): void {
    this.failNext = true;
  }
  async send(message: EmailMessage): Promise<string | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("envoi email simulé en échec");
    }
    this.sent.push(message);
    return null;
  }
}

/*
 * Limiteur de débit factice : autorise tout par défaut ; `denyKey(key)` fait échouer
 * la prochaine vérification de cette clé. Mémorise les clés vérifiées (assertions).
 */
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
  private nextId = 1;

  withDb(_db: DbClient): InMemoryStoragePort { return this; }

  async upload(key: string, body: Buffer, opts?: UploadOptions): Promise<StoredFile> {
    this.store.set(key, { body, contentType: opts?.contentType });
    const sha256 = createHash("sha256").update(body).digest("hex");
    return {
      id: this.nextId++,
      storageKey: key,
      mimeType: opts?.contentType ?? "application/octet-stream",
      sizeBytes: body.byteLength,
      sha256,
    };
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

/*
 * LLM factice déterministe : renvoie une réponse scriptée et mémorise les prompts (assertions).
 * Aucun appel réseau. `responses` = une réponse fixe, ou une file (une par appel `complete`/`stream`).
 */
export class FakeLlmPort implements LlmPort {
  readonly prompts: string[] = [];
  private readonly queue: string[];
  constructor(responses: string | string[] = "réponse simulée") {
    this.queue = Array.isArray(responses) ? [...responses] : [responses];
  }
  private next(): string {
    /** File à plusieurs entrées → consomme ; sinon réponse fixe réutilisée. */
    return this.queue.length > 1 ? (this.queue.shift() ?? "") : this.queue[0] ?? "";
  }
  async complete(prompt: string): Promise<LlmResult> {
    this.prompts.push(prompt);
    return { text: this.next(), usage: FAKE_USAGE };
  }
  async *stream(prompt: string): AsyncIterable<LlmStreamChunk> {
    this.prompts.push(prompt);
    const text = this.next();
    /** Découpe en fragments pour simuler le flux (concaténés = texte complet). */
    for (const part of text.match(/[\s\S]{1,8}/g) ?? [text]) yield { kind: "text", text: part };
    yield { kind: "done", usage: FAKE_USAGE };
  }
}

/*
 * Vision factice déterministe : renvoie une réponse scriptée et capture les requêtes (assertions).
 * Aucun appel réseau. `responses` = réponse fixe ou file (une par appel). `throwOn` force une erreur.
 */
export class FakeEventBus implements EventBusPort {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  async publishMany(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) this.published.push(e);
  }

  getPublished(type?: string): DomainEvent[] {
    return type ? this.published.filter((e) => e.type === type) : this.published;
  }
}

export class FakeWorkerPort implements WorkerPort {
  private readonly handlers = new Map<string, (event: DomainEvent) => Promise<void>>();

  register(type: string, handler: (event: DomainEvent) => Promise<void>): void {
    this.handlers.set(type, handler);
  }

  async trigger(type: string, event: DomainEvent): Promise<void> {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`Aucun handler enregistré pour le type "${type}"`);
    await handler(event);
  }

  registeredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

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
    return this.queue.length > 1 ? (this.queue.shift() ?? "") : this.queue[0] ?? "";
  }
  readonly multiRequests: VisionMultiRequest[] = [];
  async analyzeImages(req: VisionMultiRequest): Promise<string> {
    this.multiRequests.push(req);
    if (this.err) throw this.err;
    return this.queue.length > 1 ? (this.queue.shift() ?? "") : this.queue[0] ?? "";
  }
}
