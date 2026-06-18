import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";
import { generateFacturXML } from "../../../shared/pdf/facturx";

// Factur-X (facturation électronique EN 16931) pour UNE facture (parité legacy `/api/comptabilite/
// facturx-xml/:id` et `facturx/:id`). Facture possédée (404 anti-IDOR via repo migré) + lignes + client
// + profil artisan. Le XML CII est produit par le générateur INTERNALISÉ (verbatim → invariants TVA/
// montants préservés). Le « PDF Factur-X » legacy = le PDF facture standard (filename suffixé).
export interface FacturxReaderDeps {
  readonly factureReader: {
    getById(ctx: TenantContext, id: number): Promise<{ clientId: number; numero: string } | null>;
    listLignes(ctx: TenantContext, id: number): Promise<unknown[]>;
  };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<unknown | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
}
export interface FacturxPdfDeps extends FacturxReaderDeps {
  readonly pdf: PdfPort;
}

async function loadFacturxData(deps: FacturxReaderDeps, ctx: TenantContext, factureId: number) {
  const facture = await deps.factureReader.getById(ctx, factureId);
  if (!facture) throw new NotFoundError("Facture non trouvée");
  const [lignes, client, artisan] = await Promise.all([
    deps.factureReader.listLignes(ctx, factureId),
    deps.clientReader.getById(ctx, facture.clientId),
    deps.artisanReader.getProfile(ctx),
  ]);
  if (!client) throw new NotFoundError("Client introuvable");
  if (!artisan) throw new NotFoundError("Profil artisan introuvable");
  return { facture, lignes, client, artisan };
}

export async function getFacturxXml(deps: FacturxReaderDeps, ctx: TenantContext, factureId: number): Promise<{ xml: string; filename: string }> {
  const { facture, lignes, client, artisan } = await loadFacturxData(deps, ctx, factureId);
  const xml = generateFacturXML({ ...facture, lignes } as never, artisan as never, client as never);
  return { xml, filename: `FacturX_${facture.numero}.xml` };
}

export async function getFacturxPdf(deps: FacturxPdfDeps, ctx: TenantContext, factureId: number): Promise<{ buffer: Buffer; filename: string }> {
  const { facture, lignes, client, artisan } = await loadFacturxData(deps, ctx, factureId);
  const buffer = await deps.pdf.render("facture", { facture: { ...facture, lignes }, artisan, client });
  return { buffer, filename: `Facture_${facture.numero}_FacturX.pdf` };
}
