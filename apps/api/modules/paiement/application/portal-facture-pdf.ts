import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { PortalAccessResolver } from "./portal-devis-pdf";

/*
 * PDF d'une facture depuis le PORTAIL CLIENT (parité legacy `/api/portail/:token/factures/:id/pdf`).
 * Symétrique de `getPortalDevisPdf` : token public → accès (clientId+artisanId) sous RLS public-token,
 * puis facture SOUS le tenant résolu (facture.clientId === access.clientId sinon 404, anti-IDOR portail).
 * CGV ajoutées (le générateur ne les imprime pas sur un avoir — géré côté template).
 */
export interface PortalFacturePdfDeps {
  readonly accessReader: PortalAccessResolver;
  readonly factureReader: {
    getById(ctx: TenantContext, id: number): Promise<{ clientId: number; numero: string } | null>;
    listLignes(ctx: TenantContext, id: number): Promise<unknown[]>;
  };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
  readonly cgvReader: { getCgv(ctx: TenantContext): Promise<string | null> };
  readonly pdf: PdfPort;
}

export async function getPortalFacturePdf(deps: PortalFacturePdfDeps, token: string, factureId: number, now: Date = new Date()): Promise<{ buffer: Buffer; filename: string }> {
  const access = await deps.accessReader.resolveAccessByToken(token, now);
  if (!access) throw new ForbiddenError("Accès non autorisé ou expiré");

  const ctx: TenantContext = { artisanId: access.artisanId, userId: 0 };
  const facture = await deps.factureReader.getById(ctx, factureId);
  if (!facture || facture.clientId !== access.clientId) throw new NotFoundError("Facture non trouvée");

  const [lignes, client, artisan, cgv] = await Promise.all([
    deps.factureReader.listLignes(ctx, factureId),
    deps.clientReader.getById(ctx, access.clientId),
    deps.artisanReader.getProfile(ctx),
    deps.cgvReader.getCgv(ctx),
  ]);
  if (!client || !artisan) throw new NotFoundError("Données introuvables");

  const buffer = await deps.pdf.render("facture", { facture: { ...facture, lignes }, artisan, client, cgv });
  return { buffer, filename: `Facture_${facture.numero}.pdf` };
}
