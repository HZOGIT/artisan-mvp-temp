import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";

// PDF du bon d'intervention (parité legacy `/api/interventions/:id/bon-pdf`) : intervention possédée +
// client + profil artisan + nom du technicien (si assigné) → `PdfPort.render('intervention', …)`.
// ⚠️ `mobile` (signature client / heures / notes terrain) = `null` : pas encore de reader migré pour
// `intervention_mobile` → la section signature du compte-rendu est absente (parité du cas sans mobile ;
// le legacy renvoyait aussi null en l'absence/échec). À porter ultérieurement si nécessaire.
export interface InterventionPdfDeps {
  readonly interventionRepo: { getById(ctx: TenantContext, id: number): Promise<{ clientId: number; technicienId: number | null } | null> };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
  readonly technicienReader: { getById(ctx: TenantContext, id: number): Promise<{ nom: string; prenom: string | null } | null> };
  readonly pdf: PdfPort;
}

export async function getInterventionPdf(deps: InterventionPdfDeps, ctx: TenantContext, interventionId: number): Promise<{ buffer: Buffer; filename: string }> {
  const intervention = await deps.interventionRepo.getById(ctx, interventionId);
  if (!intervention) throw new NotFoundError("Intervention non trouvée");

  const client = await deps.clientReader.getById(ctx, intervention.clientId);
  if (!client) throw new NotFoundError("Client non trouvé");

  const artisan = await deps.artisanReader.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Profil artisan introuvable");

  // Nom du technicien assigné (repo scopé tenant → null si cross-tenant, ownership implicite).
  let technicienNom: string | null = null;
  if (intervention.technicienId != null) {
    const tech = await deps.technicienReader.getById(ctx, intervention.technicienId);
    if (tech) technicienNom = `${tech.prenom ?? ""} ${tech.nom}`.trim();
  }

  const buffer = await deps.pdf.render("intervention", { intervention, artisan, client, mobile: null, technicienNom });
  return { buffer, filename: `bon-intervention-${interventionId}.pdf` };
}
