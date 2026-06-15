import type { FastifyInstance } from "fastify";
import type { PortalPaymentReader } from "../../modules/paiement/application/portal-payment-reader";
import { getPaiementStatut } from "../../modules/paiement/application/use-cases";

export interface PaiementRouteDeps {
  readonly reader: PortalPaymentReader;
}

// Route PUBLIQUE par token de portail `GET /api/paiement/status/:factureId?token=…` : statut de
// paiement d'une facture (vue portail client). Le token EST la capacité (pas de cookie). Anti-IDOR :
// la facture doit appartenir au client de l'accès portail. Parité legacy.
export function registerPaiementRoute(app: FastifyInstance, deps: PaiementRouteDeps): void {
  app.get("/api/paiement/status/:factureId", async (req, reply) => {
    const token = (req.query as { token?: string } | undefined)?.token;
    const factureId = parseInt(String((req.params as { factureId?: string }).factureId ?? ""), 10);
    if (!Number.isFinite(factureId)) return reply.code(404).send({ error: "Facture non trouvée" });

    let outcome;
    try {
      outcome = await getPaiementStatut(deps.reader, { token, factureId });
    } catch {
      return reply.code(500).send({ error: "Erreur lors de la vérification du statut" });
    }
    switch (outcome.kind) {
      case "bad-request":
        return reply.code(400).send({ error: "Token requis" });
      case "forbidden":
        return reply.code(403).send({ error: "Accès portail non autorisé ou expiré" });
      case "not-found":
        return reply.code(404).send({ error: "Facture non trouvée" });
      case "ok":
        return reply.send(outcome.payload);
    }
  });
}
