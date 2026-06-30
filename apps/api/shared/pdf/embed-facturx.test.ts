import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { embedFacturXml } from "./embed-facturx";

async function minimalPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return Buffer.from(await doc.save());
}

describe("embedFacturXml — PDF/A-3b conformance (OPE-802)", () => {
  it("XMP metadata contains pdfaid:part=3 and conformance=B", async () => {
    const result = await embedFacturXml(await minimalPdf(), "<Invoice/>");
    const raw = result.toString("latin1");
    expect(raw).toContain('pdfaid:part="3"');
    expect(raw).toContain('pdfaid:conformance="B"');
  });

  it("XMP contains Factur-X extension schema + document metadata", async () => {
    const result = await embedFacturXml(await minimalPdf(), "<Invoice/>");
    const raw = result.toString("latin1");
    expect(raw).toContain("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#");
    expect(raw).toContain('fx:DocumentFileName="factur-x.xml"');
    expect(raw).toContain('fx:ConformanceLevel="MINIMUM"');
    expect(raw).toContain('fx:DocumentType="INVOICE"');
  });

  it("XMP stream is uncompressed — xpacket wrapper visible in raw bytes", async () => {
    const result = await embedFacturXml(await minimalPdf(), "<Invoice/>");
    const raw = result.toString("latin1");
    expect(raw).toContain("W5M0MpCehiHzreSzNTczkc9d");
    expect(raw).toContain("<?xpacket end=");
  });

  it("factur-x.xml attachment is present", async () => {
    const result = await embedFacturXml(await minimalPdf(), "<Invoice/>");
    const raw = result.toString("latin1");
    expect(raw).toContain("factur-x.xml");
  });
});
