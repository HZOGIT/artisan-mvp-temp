import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";

// Génère le PDF d'un bon de commande fournisseur (parité legacy `/api/commandes-fournisseurs/:id/pdf`).
// Composition : commande possédée (+ lignes) + fournisseur + profil artisan → `PdfPort.render`. Ownership
// porté par les repos migrés (scopés tenant) : un id hors tenant → null → 404 (anti-IDOR, sans oracle).
export interface BonCommandePdfDeps {
  readonly commandeRepo: {
    getById(ctx: TenantContext, id: number): Promise<{ id: number; fournisseurId: number; numero: string | null } | null>;
    listLignes(ctx: TenantContext, commandeId: number): Promise<unknown[]>;
  };
  readonly fournisseurReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
  readonly pdf: PdfPort;
}

export async function getBonCommandePdf(
  deps: BonCommandePdfDeps,
  ctx: TenantContext,
  commandeId: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const commande = await deps.commandeRepo.getById(ctx, commandeId);
  if (!commande) throw new NotFoundError("Commande non trouvée");

  const fournisseur = await deps.fournisseurReader.getById(ctx, commande.fournisseurId);
  if (!fournisseur) throw new NotFoundError("Fournisseur non trouvé");

  const artisan = await deps.artisanReader.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Profil artisan introuvable");

  const lignes = await deps.commandeRepo.listLignes(ctx, commandeId);
  const buffer = await deps.pdf.render("bon-commande", { commande: { ...commande, lignes }, artisan, fournisseur });
  return { buffer, filename: `BonCommande_${commande.numero ?? commande.id}.pdf` };
}
