import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuperPdpPaAdapter } from "./superpdp-pa-adapter";

vi.mock("../http/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from "../http/fetch-with-retry";

const mockFetch = fetchWithRetry as ReturnType<typeof vi.fn>;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKEN_RES = jsonRes({ access_token: "test-tok", expires_in: 3600 });

beforeEach(() => vi.clearAllMocks());

describe("SuperPdpPaAdapter — alignement endpoints OpenAPI", () => {
  const adapter = new SuperPdpPaAdapter("cid", "cs", "https://api.superpdp.tech");

  describe("ensureEntity", () => {
    it("appelle POST /v1.beta/companies (pas /members) et parse id entier → string", async () => {
      mockFetch
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({ id: 42, formal_name: "Durand Plomberie", number: "12345678901234" }));

      const result = await adapter.ensureEntity({ siret: "12345678901234", nom: "Durand", email: "a@b.com" });

      const calls = mockFetch.mock.calls;
      expect(calls[0][0]).toContain("/oauth2/token");
      expect(calls[1][0]).toBe("https://api.superpdp.tech/v1.beta/companies");
      expect(calls[1][1]?.method).toBe("POST");
      expect(result.paEntityId).toBe("42");
      expect(result.kybStatut).toBe("pending");
    });

    it("sur 409 appelle GET /v1.beta/companies/me et retourne l'id existant", async () => {
      mockFetch
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({}, 409))
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({ id: 7, formal_name: "Bertrand Elec" }));

      const result = await adapter.ensureEntity({ siret: "12345678901234", nom: "Bertrand", email: "b@c.com" });

      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls).toContain("https://api.superpdp.tech/v1.beta/companies/me");
      expect(result.paEntityId).toBe("7");
    });
  });

  describe("getLifecycle", () => {
    it("appelle GET /v1.beta/invoice_events?invoice_id=… (pas /invoices/{id}/events)", async () => {
      const events = [
        { id: 1, invoice_id: 99, status_code: "fr:200", created_at: "2026-01-15T10:00:00Z", status_text: "deposee" },
        { id: 2, invoice_id: 99, status_code: "fr:201", created_at: "2026-01-16T10:00:00Z", status_text: undefined },
      ];
      mockFetch
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({ data: events, has_after: false }));

      const result = await adapter.getLifecycle("99");

      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("/v1.beta/invoice_events");
      expect(url).toContain("invoice_id=99");
      expect(url).not.toContain("/invoices/99/events");

      expect(result).toHaveLength(2);
      expect(result[0].paDocumentId).toBe("99");
      expect(result[0].statut).toBe("deposee");
      expect(result[0].timestamp).toEqual(new Date("2026-01-15T10:00:00Z"));
      expect(result[1].statut).toBe("emise");
    });
  });

  describe("listInbound", () => {
    it("utilise direction=in (pas inbound) et date= (pas since=), sans member_id", async () => {
      mockFetch
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({
          count: 1,
          data: [{
            id: 55,
            en_invoice: {
              issue_date: "2026-03-01",
              seller: { legal_registration_identifier: { value: "98765432100018" } },
              totals: { total_with_vat: "1200.00" },
            },
          }],
          has_before: false,
          has_after: false,
        }));

      const result = await adapter.listInbound("ignored-entity-id", new Date("2026-01-01T00:00:00Z"));

      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain("direction=in");
      expect(url).not.toContain("inbound");
      expect(url).toContain("date=2026-01-01");
      expect(url).not.toContain("since=");
      expect(url).not.toContain("member_id");

      expect(result).toHaveLength(1);
      expect(result[0].paDocumentId).toBe("55");
      expect(result[0].emetteurSiret).toBe("98765432100018");
      expect(result[0].montantTTC).toBe("1200.00");
    });
  });

  describe("submitInvoice", () => {
    it("parse id entier en string et status depuis events[0].status_code", async () => {
      mockFetch
        .mockResolvedValueOnce(TOKEN_RES.clone())
        .mockResolvedValueOnce(jsonRes({
          id: 123,
          events: [{ status_code: "fr:200" }],
          company_id: 1,
          direction: "out",
        }));

      const result = await adapter.submitInvoice({ paEntityId: "1", invoiceId: 5, artisanId: undefined });

      expect(result.paDocumentId).toBe("123");
      expect(result.statut).toBe("deposee");
    });
  });
});
