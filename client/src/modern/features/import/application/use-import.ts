import { trpc } from "@/modern/shared/trpc";
import type { ImportKind, CsvRow, Mapping, ImportResult } from "../domain/import";

// Couche APPLICATION — import ERP : les 3 mutations (clients/devis/factures) + invalidation ciblée selon
// le type importé. SEULE couche important tRPC. L'orchestration (étapes du wizard) reste en UI.
export function useImport() {
  const utils = trpc.useUtils();
  const importClients = trpc.importErp.importClients.useMutation();
  const importDevis = trpc.importErp.importDevis.useMutation();
  const importFactures = trpc.importErp.importFactures.useMutation();

  async function lancer(kind: ImportKind, rows: CsvRow[], mapping: Mapping): Promise<ImportResult> {
    if (kind === "clients") { const r = await importClients.mutateAsync({ rows, mapping }); utils.clients.list.invalidate(); return r; }
    if (kind === "devis") { const r = await importDevis.mutateAsync({ rows, mapping }); utils.devis.list.invalidate(); return r; }
    const r = await importFactures.mutateAsync({ rows, mapping }); utils.factures.list.invalidate(); return r;
  }

  const isImporting = importClients.isPending || importDevis.isPending || importFactures.isPending;
  return { lancer, isImporting };
}
