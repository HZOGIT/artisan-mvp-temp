import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";

/*
 * PDF d'un devis depuis le PORTAIL CLIENT (parité legacy `/api/portail/:token/devis/:id/pdf`). PUBLIC :
 * le token (`client_portal_access`) EST la capacité (pas de cookie). On résout l'accès (clientId+artisanId)
 * sous RLS public-token, puis on lit le devis SOUS LE TENANT résolu — le devis DOIT relever du clientId
 * de l'accès (anti-IDOR). CGV de l'artisan ajoutées en fin de PDF.
 */
export interface PortalAccessResolver {
  resolveAccessByToken(token: string, now: Date): Promise<{ clientId: number; artisanId: number } | null>;
}
export interface PortalDevisPdfDeps {
  readonly accessReader: PortalAccessResolver;
  readonly devisReader: {
    getById(ctx: TenantContext, id: number): Promise<{ clientId: number; numero: string } | null>;
    listLignes(ctx: TenantContext, id: number): Promise<unknown[]>;
  };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
  readonly cgvReader: { getCgv(ctx: TenantContext): Promise<string | null> };
  readonly pdf: PdfPort;
}

export async function getPortalDevisPdf(deps: PortalDevisPdfDeps, token: string, devisId: number, now: Date = new Date()): Promise<{ buffer: Buffer; filename: string }> {
  const access = await deps.accessReader.resolveAccessByToken(token, now);
  if (!access) throw new ForbiddenError("Accès non autorisé ou expiré");

  const ctx: TenantContext = { artisanId: access.artisanId, userId: 0 };
  const devis = await deps.devisReader.getById(ctx, devisId);
  if (!devis || devis.clientId !== access.clientId) throw new NotFoundError("Devis non trouvé");

  const [lignes, client, artisan, cgv] = await Promise.all([
    deps.devisReader.listLignes(ctx, devisId),
    deps.clientReader.getById(ctx, access.clientId),
    deps.artisanReader.getProfile(ctx),
    deps.cgvReader.getCgv(ctx),
  ]);
  if (!client || !artisan) throw new NotFoundError("Données introuvables");

  const buffer = await deps.pdf.render("devis", { devis: { ...devis, lignes }, artisan, client, cgv });
  return { buffer, filename: `Devis_${devis.numero}.pdf` };
}
