import type { WorkerPort } from "../ports/event-bus";

/**
 * Enregistre un worker par type d'événement domaine. Les handlers sont aujourd'hui des stubs de
 * câblage (aucun publisher ne les émet encore) ; l'implémentation (emails, audit, génération
 * Factur-X, dunning…) est suivie dans le backlog Phase 2.
 */
export function registerWorkers(workers: WorkerPort): void {
  workers.register("FACTURE_PAYEE", async (_event) => {
    /* stub de câblage — implémentation Phase 2 */
  });
  workers.register("DEVIS_ACCEPTE", async (_event) => {
    /* stub de câblage — implémentation Phase 2 */
  });
  workers.register("SIGNATURE_COMPLETE", async (_event) => {
    /* stub de câblage — implémentation Phase 2 */
  });
  workers.register("ABONNEMENT_EXPIRE", async (_event) => {
    /* stub de câblage — implémentation Phase 2 */
  });
}
