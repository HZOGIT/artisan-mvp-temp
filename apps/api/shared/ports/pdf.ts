/** Port de rendu PDF (devis, factures…). `render` produit le binaire du document. */
export interface PdfPort {
  render(template: string, data: Record<string, unknown>): Promise<Buffer>;
}
