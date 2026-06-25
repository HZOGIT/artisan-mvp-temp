import type { PdfPort } from "../ports/pdf";
import {
  generateDevisPDF,
  generateFacturePDF,
  generateBonCommandePDF,
  generateContratPDF,
  generateInterventionPDF,
} from "./pdf-generator";

/*
 * Adapter PDF jsPDF INTERNALISÉ dans le new-stack — SEUL adapter PDF (le `LegacyPdfAdapter`/sidecar a été supprimé). Le
 * générateur `./pdf-generator` (jsPDF). Route `render(template, data)` vers le bon générateur ; les
 * `data` sont les objets domaine migrés (Devis/Facture/Commande + artisan/client/fournisseur), qui
 * satisfont structurellement les types d'entrée (cf. `pdf-input-types.ts`).
 */
export class JsPdfAdapter implements PdfPort {
  render(template: string, data: Record<string, unknown>): Promise<Buffer> {
    switch (template) {
      case "devis":
        return Promise.resolve(generateDevisPDF(data as never));
      case "facture":
        return Promise.resolve(generateFacturePDF(data as never));
      case "bon-commande":
        return Promise.resolve(generateBonCommandePDF(data as never));
      case "contrat":
        return Promise.resolve(generateContratPDF(data as never));
      case "intervention":
        return Promise.resolve(generateInterventionPDF(data as never));
      default:
        return Promise.reject(new Error(`Template PDF inconnu : ${template}`));
    }
  }
}
