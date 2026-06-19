import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "./client-repository";
import type { CreateClientInput } from "../domain/client";
import { creerClient } from "./write-use-cases";

/*
 * Import en masse de clients (parité legacy `clients.importFromExcel`). Les lignes sont déjà
 * parsées côté client (pas de binaire Excel ici). Best-effort **par ligne** : une ligne invalide
 * (ex. nom vide → ValidationError) est ignorée (`skipped`), les autres sont créées (`imported`) —
 * l'import ne s'interrompt jamais. Chaque création est scopée tenant (artisanId forcé par le repo).
 */
export interface ImportClientsResult {
  readonly imported: number;
  readonly skipped: number;
}

export async function importerClients(
  repo: IClientRepository,
  ctx: TenantContext,
  rows: readonly CreateClientInput[],
): Promise<ImportClientsResult> {
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await creerClient(repo, ctx, row);
      imported++;
    } catch {
      // Ligne rejetée (validation/contrainte) → ignorée, comme le legacy (try/catch par ligne).
      skipped++;
    }
  }
  return { imported, skipped };
}
