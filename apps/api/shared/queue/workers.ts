import type { WorkerPort } from "../ports/event-bus";

export function registerWorkers(workers: WorkerPort): void {
  workers.register("FACTURE_PAYEE", async (_event) => {
    /* TODO Phase 2 : email reçu + audit trail + génération FacturX */
  });
  workers.register("DEVIS_ACCEPTE", async (_event) => {
    /* TODO Phase 2 : notification artisan + archivage */
  });
  workers.register("SIGNATURE_COMPLETE", async (_event) => {
    /* TODO Phase 2 : email confirmation + audit légal */
  });
  workers.register("ABONNEMENT_EXPIRE", async (_event) => {
    /* TODO Phase 2 : dunning J0 / J+3 / J+7 */
  });
}
