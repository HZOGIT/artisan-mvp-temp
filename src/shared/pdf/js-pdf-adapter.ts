import type { PdfPort } from "../ports/pdf";
import {
  generateDevisPDF,
  generateFacturePDF,
  generateBonCommandePDF,
  generateContratPDF,
  generateInterventionPDF,
} from "./pdf-generator";

// Adapter PDF jsPDF INTERNALISÉ dans le new-stack (remplace `LegacyPdfAdapter`, qui chargeait le
// générateur bundlé depuis `server/`). Route `render(template, data)` vers le bon générateur ; les
// `data` sont les objets domaine migrés (Devis/Facture/Commande + artisan/client/fournisseur), qui
// satisfont structurellement les types d'entrée (cf. `pdf-input-types.ts`).
export class JsPdfAdapter implements PdfPort {
  async render(template: string, data: Record<string, unknown>): Promise<Buffer> {
    switch (template) {
      case "devis":
        return generateDevisPDF(data as never);
      case "facture":
        return generateFacturePDF(data as never);
      case "bon-commande":
        return generateBonCommandePDF(data as never);
      case "contrat":
        return generateContratPDF(data as never);
      case "intervention":
        return generateInterventionPDF(data as never);
      default:
        throw new Error(`Template PDF inconnu : ${template}`);
    }
  }
}
