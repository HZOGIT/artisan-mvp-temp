import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";

/*
 * PDF d'un contrat de maintenance (parité legacy `/api/contrats/:id/pdf`) : contrat possédé + client +
 * profil artisan → `PdfPort.render('contrat', …)`. Ownership via repos migrés (404 anti-IDOR, sans oracle).
 */
export interface ContratPdfDeps {
  readonly contratRepo: { getById(ctx: TenantContext, id: number): Promise<{ clientId: number; reference: string } | null> };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
  readonly pdf: PdfPort;
}

export async function getContratPdf(deps: ContratPdfDeps, ctx: TenantContext, contratId: number): Promise<{ buffer: Buffer; filename: string }> {
  const contrat = await deps.contratRepo.getById(ctx, contratId);
  if (!contrat) throw new NotFoundError("Contrat non trouvé");

  const client = await deps.clientReader.getById(ctx, contrat.clientId);
  if (!client) throw new NotFoundError("Client non trouvé");

  const artisan = await deps.artisanReader.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Profil artisan introuvable");

  const buffer = await deps.pdf.render("contrat", { contrat, artisan, client });
  return { buffer, filename: `${contrat.reference}.pdf` };
}
