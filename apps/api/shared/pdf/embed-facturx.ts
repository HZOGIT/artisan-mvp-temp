import { PDFDocument, AFRelationship } from "pdf-lib";

/**
 * Embeds Factur-X CII XML into an existing PDF buffer as a named attachment.
 * Required for PDF/A-3 hybrid compliance (Chorus Pro, Sage, Cegid, PPF/PDP).
 */
export async function embedFacturXml(pdfBuffer: Buffer, xmlString: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  await doc.attach(Buffer.from(xmlString, "utf-8"), "factur-x.xml", {
    mimeType: "application/xml",
    description: "Factur-X XML",
    afRelationship: AFRelationship.Data,
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  return Buffer.from(await doc.save());
}
