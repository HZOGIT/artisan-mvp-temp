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

interface TokenCache { accessToken: string; expiresAt: number }

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

export class SuperPdpPaAdapter implements PaPort {
  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl: string,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.accessToken;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetchWithRetry(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      forceRetry: true,
    });
    if (!res.ok) throw new Error(`SuperPDP OAuth2 failed: ${res.status}`);
    const json = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
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
    /* Champs exacts à confirmer sur sandbox SuperPDP (siret / name / email) */
    /* POST /v1.beta/members — idempotent sur SIRET ; 409 = déjà enregistré */
    const res = await this.apiFetch("/v1.beta/members", {
      method: "POST",
      body: JSON.stringify({ siret: input.siret, name: input.nom, email: input.email }),
    });
    if (res.status === 409) {
      const get = await this.apiFetch(`/v1.beta/members?siret=${encodeURIComponent(input.siret)}`);
      if (!get.ok) throw new Error(`SuperPDP GET /v1.beta/members → ${get.status}`);
      const existing = await get.json() as { id: string; kyb_status: string };
      return { paEntityId: existing.id, kybStatut: existing.kyb_status ?? "pending" };
    }
    if (!res.ok) throw new Error(`SuperPDP POST /v1.beta/members → ${res.status}`);
    const data = await res.json() as { id: string; kyb_status: string };
    return { paEntityId: data.id, kybStatut: data.kyb_status ?? "pending" };
  }

  async submitInvoice(input: SubmitInvoiceInput): Promise<{ paDocumentId: string; statut: string }> {
    /* Format à confirmer sur sandbox SuperPDP (JSON EN16931 vs Factur-X base64) */
    /* POST /v1.beta/invoices */
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
    const res = await this.apiFetch("/v1.beta/invoices", { method: "POST", body });
    if (!res.ok) throw new Error(`SuperPDP POST /v1.beta/invoices → ${res.status}`);
    const data = await res.json() as { id: string; status: string };
    return { paDocumentId: data.id, statut: mapAfnorStatut(data.status) };
  }

  async getLifecycle(paDocumentId: string): Promise<LifecycleEvent[]> {
    /* Endpoint et champs à vérifier sur sandbox (occurred_at / invoice_id / status) */
    /* GET /v1.beta/invoices/{id}/events */
    const res = await this.apiFetch(`/v1.beta/invoices/${encodeURIComponent(paDocumentId)}/events`);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoices/{id}/events → ${res.status}`);
    const data = await res.json() as Array<{
      invoice_id: string;
      status: string;
      occurred_at: string;
      detail?: string;
    }>;
    return data.map((e) => ({
      paDocumentId: e.invoice_id,
      statut: mapAfnorStatut(e.status),
      timestamp: new Date(e.occurred_at),
      detail: e.detail,
    }));
  }

  async listInbound(paEntityId: string, since: Date): Promise<InboundInvoice[]> {
    /* Pagination et noms de champs à confirmer (seller_siret / total_incl_vat / issue_date) */
    /* GET /v1.beta/invoices?direction=inbound&member_id=...&since=... */
    const params = new URLSearchParams({
      direction: "inbound",
      member_id: paEntityId,
      since: since.toISOString(),
    });
    const res = await this.apiFetch(`/v1.beta/invoices?${params.toString()}`);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoices (inbound) → ${res.status}`);
    const data = await res.json() as Array<{
      id: string;
      seller_siret: string;
      total_incl_vat: string;
      issue_date: string;
    }>;
    return data.map((d) => ({
      paDocumentId: d.id,
      emetteurSiret: d.seller_siret,
      montantTTC: d.total_incl_vat,
      date: new Date(d.issue_date),
    }));
  }

  async fetchInbound(paDocumentId: string): Promise<InboundInvoiceFull> {
    /* Champ base64 à confirmer sur sandbox (facturx_base64 vs pdf_base64) */
    /* GET /v1.beta/invoices/{id} */
    const res = await this.apiFetch(`/v1.beta/invoices/${encodeURIComponent(paDocumentId)}`);
    if (!res.ok) throw new Error(`SuperPDP GET /v1.beta/invoices/{id} → ${res.status}`);
    const data = await res.json() as {
      id: string;
      seller_siret: string;
      total_incl_vat: string;
      issue_date: string;
      facturx_base64: string;
    };
    return {
      paDocumentId: data.id,
      emetteurSiret: data.seller_siret,
      montantTTC: data.total_incl_vat,
      date: new Date(data.issue_date),
      facturxBase64: data.facturx_base64,
    };
  }

  verifyWebhook(_rawBody: Buffer, _signature: string | undefined): WebhookEvent {
    /* SuperPDP ne supporte pas les webhooks — utiliser le polling de réconciliation */
    throw new Error("SuperPDP ne supporte pas les webhooks — utiliser le polling de réconciliation");
  }
}
