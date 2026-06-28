import { eq, sql } from "drizzle-orm";
import type { PaPort } from "../../modules/einvoicing/application/pa-port";
import type {
  EntityInput,
  InboundInvoice,
  InboundInvoiceFull,
  LifecycleEvent,
  SubmitInvoiceInput,
  WebhookEvent,
} from "../../modules/einvoicing/domain/einvoicing";
import { fetchWithRetry } from "../http/fetch-with-retry";
import type { DbClient } from "../db";
import { superpdpTokens } from "../../../../drizzle/schema/einvoicing";

/** Codes AFNOR EN16931 (fr:2XX) → valeur cycleVieEnum Operioz */
const AFNOR_STATUTS: Record<string, string> = {
  "fr:200": "deposee",
  "fr:201": "emise",
  "fr:202": "recue",
  "fr:203": "mise_a_dispo",
  "fr:204": "prise_en_charge",
  "fr:205": "approuvee",
  "fr:206": "en_litige",
  "fr:207": "paiement_transmis",
  "fr:210": "refusee",
  "fr:212": "encaissee",
  "fr:213": "rejetee",
};

export function mapAfnorStatut(code: string): string {
  return AFNOR_STATUTS[code] ?? "prise_en_charge";
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface CompanyResponse {
  id: number;
  formal_name?: string;
  number?: string;
}

interface InvoiceResponse {
  id: number;
  en_invoice: {
    issue_date: string;
    seller?: { legal_registration_identifier?: { value?: string } };
    totals?: { total_with_vat?: string };
  };
  events?: Array<{ status_code: string }>;
}

interface InvoiceOverview {
  id: number;
  en_invoice?: {
    issue_date?: string;
    seller?: { legal_registration_identifier?: { value?: string } };
    totals?: { total_with_vat?: string };
  };
}

interface InvoiceEvent {
  id: number;
  invoice_id: number;
  status_code: string;
  created_at: string;
  status_text?: string;
}

export class SuperPdpPaAdapter implements PaPort {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl: string,
    /** Pool app_tenant (RLS-soumis) — toutes les I/O token passent par withArtisan. */
    private readonly db: DbClient | null = null,
  ) {}

  /** Exécute fn dans une transaction avec app.tenant positionné → active la RLS pour cet artisan. */
  private async withArtisan<T>(artisanId: number, fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if (!this.db) throw new Error("DB non injectée dans SuperPdpPaAdapter");
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant', ${String(artisanId)}, true)`);
      return fn(tx as unknown as DbClient);
    });
  }

  /** Upsert un token OAuth artisan en base — appelé par le callback OAuth. */
  async upsertToken(artisanId: number, data: { accessToken: string; refreshToken: string | null; expiresAt: Date }): Promise<void> {
    await this.withArtisan(artisanId, async (tx) => {
      await tx
        .insert(superpdpTokens)
        .values({ artisanId, accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt })
        .onConflictDoUpdate({
          target: superpdpTokens.artisanId,
          set: { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt, updatedAt: new Date() },
        });
    });
  }

  /** Token per-artisan depuis la DB — refresh automatique si expiré. */
  async getTokenForArtisan(artisanId: number): Promise<string | null> {
    if (!this.db) return null;
    const rows = await this.withArtisan(artisanId, async (tx) =>
      tx.select().from(superpdpTokens).where(eq(superpdpTokens.artisanId, artisanId)).limit(1),
    );
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt.getTime() > Date.now() + 30_000) return row.accessToken;
    if (!row.refreshToken) return null;
    return this.refreshToken(artisanId, row.refreshToken);
  }

  private async refreshToken(artisanId: number, refreshToken: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetchWithRetry(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      forceRetry: true,
    });
    if (!res.ok) throw new Error(`SuperPDP token refresh failed: ${res.status}`);
    const json = await res.json() as TokenResponse;
    const expiresAt = new Date(Date.now() + json.expires_in * 1000);
    await this.upsertToken(artisanId, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt,
    });
    return json.access_token;
  }

  private async getAccessToken(artisanId?: number): Promise<string> {
    if (artisanId != null) {
      const token = await this.getTokenForArtisan(artisanId);
      if (token) return token;
    }
    /* ponytail: client_credentials fallback — utilisé tant qu'aucun token per-artisan n'est stocké (avant connexion OAuth) */
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetchWithRetry(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      forceRetry: true,
    });
    if (!res.ok) throw new Error(`SuperPDP OAuth2 failed: ${res.status}`);
    const json = await res.json() as { access_token: string; expires_in: number };
    return json.access_token;
  }

  private async apiFetch(path: string, artisanId: number | undefined, opts: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken(artisanId);
    return fetchWithRetry(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers as Record<string, string> | undefined),
      },
    });
  }

  async ensureEntity(input: EntityInput): Promise<{ paEntityId: string; kybStatut: string }> {
    const getMe = async (): Promise<{ paEntityId: string; kybStatut: string }> => {
      const res = await this.apiFetch("/v1.beta/companies/me", input.artisanId);
      if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/companies/me → ${res.status}`);
      const data = await res.json() as CompanyResponse;
      return { paEntityId: String(data.id), kybStatut: "pending" };
    };

    const form = new FormData();
    form.append(
      "enroll",
      new Blob(
        [JSON.stringify({ email: input.email, number: input.siret, number_scheme: "fr_siren" })],
        { type: "application/json" },
      ),
    );
    const token = await this.getAccessToken(input.artisanId);
    const res = await fetchWithRetry(`${this.baseUrl}/v1.beta/companies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.status === 409) return getMe();
    if (!res.ok) throw new Error(`SuperPDP POST /v1.beta/companies → ${res.status}`);
    const data = await res.json() as CompanyResponse;
    return { paEntityId: String(data.id), kybStatut: "pending" };
  }

  async submitInvoice(input: SubmitInvoiceInput): Promise<{ paDocumentId: string; statut: string }> {
    const p = input.payload;
    const body = JSON.stringify({
      member_id: input.paEntityId,
      ...(p && {
        type: p.typeDocument === "avoir" ? "credit_note" : "invoice",
        number: p.numero,
        issue_date: p.date,
        due_date: p.dateEcheance,
        seller: {
          siret: p.emetteur.siret,
          name: p.emetteur.nom,
          email: p.emetteur.email,
          address: p.emetteur.adresse,
          postal_code: p.emetteur.codePostal,
          city: p.emetteur.ville,
        },
        buyer: {
          siret: p.destinataire.siret,
          name: p.destinataire.nom,
          email: p.destinataire.email,
          address: p.destinataire.adresse,
          postal_code: p.destinataire.codePostal,
          city: p.destinataire.ville,
        },
        lines: p.lignes.map((l) => ({
          description: l.description,
          quantity: l.quantite,
          unit_price: l.prixUnitaireHT,
          vat_rate: l.tauxTva,
          amount_excl_vat: l.montantHT,
        })),
        vat_breakdown: p.tvaBreakdown.map((t) => ({
          rate: t.taux,
          base: t.baseHT,
          amount: t.montantTva,
        })),
        total_excl_vat: p.totalHT,
        total_vat: p.totalTva,
        total_incl_vat: p.totalTTC,
        legal_mention: p.mentionLegale,
      }),
      ...(input.facturxBase64 && { facturx_base64: input.facturxBase64 }),
    });
    const res = await this.apiFetch("/v1.beta/invoices", input.artisanId, { method: "POST", body });
    if (!res.ok) throw new Error(`SuperPDP POST /v1.beta/invoices → ${res.status}`);
    const data = await res.json() as { id: number; events?: Array<{ status_code: string }> };
    return {
      paDocumentId: String(data.id),
      statut: mapAfnorStatut(data.events?.[0]?.status_code ?? "api:uploaded"),
    };
  }

  async getLifecycle(paDocumentId: string, artisanId?: number): Promise<LifecycleEvent[]> {
    const res = await this.apiFetch(`/v1.beta/invoice_events?invoice_id=${encodeURIComponent(paDocumentId)}`, artisanId);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoice_events → ${res.status}`);
    const body = await res.json() as { data: InvoiceEvent[] };
    return body.data.map((e) => ({
      paDocumentId: String(e.invoice_id),
      statut: mapAfnorStatut(e.status_code),
      timestamp: new Date(e.created_at),
      detail: e.status_text,
    }));
  }

  async listInbound(_paEntityId: string, since: Date, artisanId?: number): Promise<InboundInvoice[]> {
    const params = new URLSearchParams({
      direction: "in",
      date: since.toISOString().slice(0, 10),
    });
    params.append("expand[]", "en_invoice");
    const res = await this.apiFetch(`/v1.beta/invoices?${params.toString()}`, artisanId);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoices (inbound) → ${res.status}`);
    const body = await res.json() as { data: InvoiceOverview[] };
    return body.data.map((d) => ({
      paDocumentId: String(d.id),
      emetteurSiret: d.en_invoice?.seller?.legal_registration_identifier?.value ?? "",
      montantTTC: d.en_invoice?.totals?.total_with_vat ?? "0",
      date: new Date(d.en_invoice?.issue_date ?? Date.now()),
    }));
  }

  async fetchInbound(paDocumentId: string, artisanId?: number): Promise<InboundInvoiceFull> {
    const res = await this.apiFetch(`/v1.beta/invoices/${encodeURIComponent(paDocumentId)}`, artisanId);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoices/{id} → ${res.status}`);
    const data = await res.json() as InvoiceResponse;
    const dlRes = await this.apiFetch(`/v1.beta/invoices/${encodeURIComponent(paDocumentId)}/download`, artisanId);
    if (!dlRes.ok) throw new Error(`SuperPDP GET /v1.beta/invoices/{id}/download → ${dlRes.status}`);
    const bytes = await dlRes.arrayBuffer();
    return {
      paDocumentId: String(data.id),
      emetteurSiret: data.en_invoice?.seller?.legal_registration_identifier?.value ?? "",
      montantTTC: data.en_invoice?.totals?.total_with_vat ?? "0",
      date: new Date(data.en_invoice.issue_date),
      facturxBase64: Buffer.from(bytes).toString("base64"),
    };
  }

  verifyWebhook(_rawBody: Buffer, _signature: string | undefined): WebhookEvent {
    /* SuperPDP ne supporte pas les webhooks — utiliser le polling de réconciliation */
    throw new Error("SuperPDP ne supporte pas les webhooks — utiliser le polling de réconciliation");
  }
}
