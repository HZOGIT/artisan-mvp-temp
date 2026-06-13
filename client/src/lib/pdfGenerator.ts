import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ROBOTO_REGULAR, ROBOTO_BOLD } from "./fonts";

// Register Roboto font for proper French accent support
function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

// ============================================================================
// Header band — coloured strip with logo + title (browser-side)
// ============================================================================

type RGB = [number, number, number];
type ImgFormat = "PNG" | "JPEG" | "WEBP";

const PRIMARY: RGB = [30, 64, 175];   // #1e40af — devis & factures
const AVOIR_RED: RGB = [220, 53, 69]; // sous-bandeau avoir

const BAND_H = 40;
const LOGO_X = 10;
const LOGO_MAX_W = 30;
const LOGO_MAX_H = 28;
const TITLE_X_WITH_LOGO = 50;
const TITLE_X_NO_LOGO = 15;
const BLOCKS_TOP_Y = 53;              // y de départ des blocs sous le bandeau

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getImageDimensions(data: Uint8Array, format: ImgFormat): { width: number; height: number } | null {
  try {
    const u16BE = (o: number) => (data[o] << 8) | data[o + 1];
    const u32BE = (o: number) => (((data[o] << 24) >>> 0) + (data[o + 1] << 16) + (data[o + 2] << 8) + data[o + 3]) >>> 0;
    const u16LE = (o: number) => data[o] | (data[o + 1] << 8);
    const ascii = (a: number, b: number) => {
      let s = "";
      for (let i = a; i < b; i++) s += String.fromCharCode(data[i]);
      return s;
    };

    if (format === "PNG") {
      if (data.length < 24) return null;
      if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) return null;
      return { width: u32BE(16), height: u32BE(20) };
    }
    if (format === "JPEG") {
      if (data[0] !== 0xff || data[1] !== 0xd8) return null;
      let off = 2;
      while (off + 9 < data.length) {
        if (data[off] !== 0xff) return null;
        let m = off;
        while (m < data.length - 1 && data[m] === 0xff) m++;
        const marker = data[m];
        off = m + 1;
        // Standalone markers (no length): SOI, EOI, RST0-7
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (off + 1 >= data.length) return null;
        const segLen = u16BE(off);
        const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) {
          if (off + 7 >= data.length) return null;
          return { width: u16BE(off + 5), height: u16BE(off + 3) };
        }
        off += segLen;
      }
      return null;
    }
    if (format === "WEBP") {
      if (data.length < 30) return null;
      if (ascii(0, 4) !== "RIFF") return null;
      if (ascii(8, 12) !== "WEBP") return null;
      const chunk = ascii(12, 16);
      if (chunk === "VP8 ") {
        return { width: u16LE(26) & 0x3fff, height: u16LE(28) & 0x3fff };
      }
      if (chunk === "VP8L") {
        const b0 = data[21], b1 = data[22], b2 = data[23], b3 = data[24];
        return {
          width: 1 + (((b1 & 0x3f) << 8) | b0),
          height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        };
      }
      if (chunk === "VP8X") {
        return {
          width: 1 + (data[24] | (data[25] << 8) | (data[26] << 16)),
          height: 1 + (data[27] | (data[28] << 8) | (data[29] << 16)),
        };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function renderLogo(doc: jsPDF, logoUrl: string | null | undefined): boolean {
  if (!logoUrl || typeof logoUrl !== "string") return false;
  const m = logoUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) return false;
  const ext = m[1].toLowerCase();
  const format: ImgFormat = ext === "webp" ? "WEBP" : ext.startsWith("jp") ? "JPEG" : "PNG";

  let drawW = LOGO_MAX_W;
  let drawH = LOGO_MAX_H;
  try {
    const bytes = base64ToBytes(m[2]);
    const dims = getImageDimensions(bytes, format);
    if (dims && dims.width > 0 && dims.height > 0) {
      const ratio = dims.width / dims.height;
      drawW = LOGO_MAX_W;
      drawH = drawW / ratio;
      if (drawH > LOGO_MAX_H) {
        drawH = LOGO_MAX_H;
        drawW = drawH * ratio;
      }
    }
  } catch {
    // Fall back to max box
  }

  const drawY = (BAND_H - drawH) / 2;
  try {
    doc.addImage(logoUrl, format, LOGO_X, drawY, drawW, drawH);
    return true;
  } catch {
    return false;
  }
}

function renderHeaderBand(doc: jsPDF, artisan: Artisan, title: string, numero: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, BAND_H, "F");

  const hasLogo = renderLogo(doc, artisan.logo);
  const titleX = hasLogo ? TITLE_X_WITH_LOGO : TITLE_X_NO_LOGO;

  doc.setTextColor(255, 255, 255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(22);
  doc.text(title, titleX, 22);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(11);
  doc.text(`N° ${numero}`, titleX, 32);
}

function renderArtisanBlock(doc: jsPDF, artisan: Artisan, yStart: number): number {
  let yPos = yStart;
  doc.setFontSize(11);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(artisan.nomEntreprise || "Mon Entreprise", 20, yPos);

  yPos += 6;
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  if (artisan.adresse) {
    doc.text(artisan.adresse, 20, yPos);
    yPos += 5;
  }
  if (artisan.codePostal || artisan.ville) {
    doc.text(`${artisan.codePostal || ""} ${artisan.ville || ""}`.trim(), 20, yPos);
    yPos += 5;
  }
  if (artisan.telephone) {
    doc.text(`Tél: ${artisan.telephone}`, 20, yPos);
    yPos += 5;
  }
  if (artisan.email) {
    doc.text(`Email: ${artisan.email}`, 20, yPos);
    yPos += 5;
  }
  if (artisan.siret) {
    doc.text(`SIRET: ${artisan.siret}`, 20, yPos);
    yPos += 5;
  }
  // OPE-151 — mentions légales émetteur (société : forme/capital/RCS ; RM si renseigné).
  const SOCIETES = ["EURL", "SARL", "SAS", "SASU", "SA"];
  if (artisan.formeJuridique && SOCIETES.includes(artisan.formeJuridique)) {
    const siren = artisan.siret ? String(artisan.siret).replace(/\D/g, "").slice(0, 9) : "";
    const cap = artisan.capitalSocial != null && String(artisan.capitalSocial) !== ""
      ? `au capital de ${Number(artisan.capitalSocial).toLocaleString("fr-FR")} €` : "";
    const head = [artisan.formeJuridique, cap].filter(Boolean).join(" ");
    const rcs = artisan.villeRCS && siren ? `RCS ${artisan.villeRCS} ${siren}` : "";
    const line = [head, rcs].filter(Boolean).join(" — ");
    if (line) { doc.text(line, 20, yPos); yPos += 5; }
  }
  if (artisan.numeroRM) {
    doc.text(`RM ${artisan.numeroRM}`, 20, yPos);
    yPos += 5;
  }

  return yPos;
}

// ============================================================================
// Types
// ============================================================================

interface Artisan {
  nomEntreprise?: string | null;
  siret?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
  logo?: string | null;
  // OPE-151 — mentions légales émetteur (société : forme/capital/RCS ; RM)
  formeJuridique?: string | null;
  capitalSocial?: string | null;
  villeRCS?: string | null;
  numeroRM?: string | null;
}

interface Client {
  nom: string;
  prenom?: string | null;
  entreprise?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  // OPE-93 — adresse de facturation distincte (fallback adresse principale)
  adresseFacturation?: string | null;
  codePostalFacturation?: string | null;
  villeFacturation?: string | null;
  telephone?: string | null;
  email?: string | null;
  // OPE-92 — identité B2B (rappelée sur le document si client professionnel)
  type?: string | null;
  raisonSociale?: string | null;
  siret?: string | null;
  numeroTVA?: string | null;
}

interface LigneDocument {
  designation: string;
  description?: string | null;
  quantite: number;
  unite?: string | null;
  prixUnitaire: number;
  tauxTva?: number | null;
  // OPE-168 — `section` (en-tête de lot) / `note` (texte libre) rendues en pleine
  // largeur, sans colonnes de prix, exclues des totaux. Absent/`produit` = ligne normale.
  type?: string | null;
}

interface DevisData {
  numero: string;
  dateCreation: Date | string;
  dateValidite?: Date | string | null;
  statut: string;
  objet?: string | null;
  referenceClient?: string | null;
  lignes: LigneDocument[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  conditions?: string | null;
}

interface FactureData {
  numero: string;
  dateCreation: Date | string;
  dateEcheance?: Date | string | null;
  statut: string;
  objet?: string | null;
  referenceClient?: string | null;
  lignes: LigneDocument[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  montantPaye?: number | null;
  conditions?: string | null;
  isAvoir?: boolean;
}

interface PdfOptions {
  mentionsLegales?: string | null;
  cgv?: string | null;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function getStatutLabel(statut: string, type: "devis" | "facture"): string {
  if (type === "devis") {
    const labels: Record<string, string> = {
      brouillon: "Brouillon",
      envoye: "Envoyé",
      accepte: "Accepté",
      refuse: "Refusé",
      expire: "Expiré",
    };
    return labels[statut] || statut;
  } else {
    const labels: Record<string, string> = {
      brouillon: "Brouillon",
      envoyee: "Envoyée",
      payee: "Payée",
      partiellement_payee: "Partiellement payée",
      en_retard: "En retard",
      annulee: "Annulée",
    };
    return labels[statut] || statut;
  }
}

function addClientInfo(doc: jsPDF, client: Client, yStart: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = yStart;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(pageWidth - 90, yPos - 5, 70, 45, 3, 3, "FD");

  doc.setFontSize(10);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Client", pageWidth - 85, yPos + 3);

  yPos += 10;
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  // OPE-92 — client pro : raison sociale comme intitulé + mentions SIRET / TVA.
  const isPro = client.type === "professionnel";
  const clientName = (isPro && client.raisonSociale) || client.entreprise || `${client.prenom || ""} ${client.nom}`.trim();
  doc.text(clientName, pageWidth - 85, yPos);
  yPos += 5;

  // OPE-93 — adresse de facturation si renseignée (fallback par champ vers principale).
  const adrFact = client.adresseFacturation || client.adresse;
  const cpFact = client.codePostalFacturation || client.codePostal;
  const villeFact = client.villeFacturation || client.ville;
  if (adrFact) {
    doc.text(adrFact, pageWidth - 85, yPos);
    yPos += 5;
  }
  if (cpFact || villeFact) {
    doc.text(`${cpFact || ""} ${villeFact || ""}`.trim(), pageWidth - 85, yPos);
    yPos += 5;
  }
  if (client.telephone) {
    doc.text(`Tél: ${client.telephone}`, pageWidth - 85, yPos);
    yPos += 5;
  }
  if (isPro && client.siret) {
    doc.text(`SIRET: ${client.siret}`, pageWidth - 85, yPos);
    yPos += 5;
  }
  if (isPro && client.numeroTVA) {
    doc.text(`TVA: ${client.numeroTVA}`, pageWidth - 85, yPos);
    yPos += 5;
  }

  return Math.max(yStart + 50, yPos + 5);
}

function addDocumentInfo(
  doc: jsPDF,
  data: { dateCreation: Date | string; dateValidite?: Date | string | null; dateEcheance?: Date | string | null; statut: string; objet?: string | null; referenceClient?: string | null },
  type: "devis" | "facture",
  yStart: number
): number {
  let yPos = yStart;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  doc.setFont("Roboto", "bold");
  doc.text("Date d'émission:", 20, yPos);
  doc.setFont("Roboto", "normal");
  doc.text(formatDate(data.dateCreation), 65, yPos);

  yPos += 6;
  if (type === "devis" && data.dateValidite) {
    doc.setFont("Roboto", "bold");
    doc.text("Valide jusqu'au:", 20, yPos);
    doc.setFont("Roboto", "normal");
    doc.text(formatDate(data.dateValidite), 65, yPos);
    yPos += 6;
  } else if (type === "facture" && data.dateEcheance) {
    doc.setFont("Roboto", "bold");
    doc.text("Échéance:", 20, yPos);
    doc.setFont("Roboto", "normal");
    doc.text(formatDate(data.dateEcheance), 65, yPos);
    yPos += 6;
  }

  doc.setFont("Roboto", "bold");
  doc.text("Statut:", 20, yPos);
  doc.setFont("Roboto", "normal");
  doc.text(getStatutLabel(data.statut, type), 65, yPos);

  // OPE-158 — référence/N° de commande du client (B2B), rappelée si renseignée.
  if (data.referenceClient) {
    yPos += 6;
    doc.setFont("Roboto", "bold");
    doc.text("Votre réf.:", 20, yPos);
    doc.setFont("Roboto", "normal");
    doc.text(String(data.referenceClient), 65, yPos);
  }

  if (data.objet) {
    yPos += 10;
    doc.setFont("Roboto", "bold");
    doc.text("Objet:", 20, yPos);
    doc.setFont("Roboto", "normal");
    const objetLines = doc.splitTextToSize(data.objet, 150);
    doc.text(objetLines, 45, yPos);
    yPos += objetLines.length * 5;
  }

  return yPos + 10;
}

function addLignesTable(doc: jsPDF, lignes: LigneDocument[], yStart: number): number {
  // OPE-168 — une ligne `section`/`note` occupe toute la largeur (titre de lot en
  // gras / texte libre en italique) sans colonnes chiffrées ; les autres restent des
  // lignes produit normales. autoTable accepte des cellules { content, colSpan, styles }.
  const tableData = lignes.map((ligne) => {
    if (ligne.type === "section") {
      return [
        {
          content: ligne.designation,
          colSpan: 6,
          styles: { fontStyle: "bold" as const, fillColor: [226, 232, 240] as [number, number, number], textColor: [30, 41, 59] as [number, number, number] },
        },
      ];
    }
    if (ligne.type === "note") {
      return [
        {
          content: ligne.designation,
          colSpan: 6,
          styles: { fontStyle: "italic" as const, textColor: [100, 100, 100] as [number, number, number] },
        },
      ];
    }
    return [
      ligne.designation,
      ligne.quantite.toString(),
      ligne.unite || "u",
      formatCurrency(ligne.prixUnitaire),
      `${ligne.tauxTva || 20}%`,
      formatCurrency(ligne.quantite * ligne.prixUnitaire),
    ];
  });

  autoTable(doc, {
    startY: yStart,
    head: [["Désignation", "Qté", "Unité", "P.U. HT", "TVA", "Total HT"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      font: "Roboto",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [60, 60, 60],
      font: "Roboto",
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 15, halign: "center" },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 15, halign: "center" },
      5: { cellWidth: 30, halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
}

function addTotals(
  doc: jsPDF,
  totalHT: number,
  totalTVA: number,
  totalTTC: number,
  yStart: number,
  montantPaye?: number | null
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = yStart;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  const boxHeight = montantPaye !== undefined && montantPaye !== null ? 50 : 35;
  doc.roundedRect(pageWidth - 90, yPos, 70, boxHeight, 3, 3, "FD");

  yPos += 8;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  doc.setFont("Roboto", "normal");
  doc.text("Total HT:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalHT), pageWidth - 25, yPos, { align: "right" });

  yPos += 7;
  doc.text("Total TVA:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalTVA), pageWidth - 25, yPos, { align: "right" });

  yPos += 7;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.setTextColor(41, 128, 185);
  doc.text("Total TTC:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalTTC), pageWidth - 25, yPos, { align: "right" });

  if (montantPaye !== undefined && montantPaye !== null) {
    yPos += 8;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("Roboto", "normal");
    doc.text("Déjà payé:", pageWidth - 85, yPos);
    doc.text(formatCurrency(montantPaye), pageWidth - 25, yPos, { align: "right" });

    yPos += 7;
    doc.setFont("Roboto", "bold");
    if (totalTTC - montantPaye > 0) {
      doc.setTextColor(220, 53, 69);
    } else {
      doc.setTextColor(40, 167, 69);
    }
    doc.text("Reste à payer:", pageWidth - 85, yPos);
    doc.text(formatCurrency(totalTTC - montantPaye), pageWidth - 25, yPos, { align: "right" });
  }

  return yPos + 15;
}

function addFooter(doc: jsPDF, conditions?: string | null, mentionsLegales?: string | null): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  let footerY = pageHeight - 10;

  // Mentions légales above the footer line
  if (mentionsLegales) {
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont("Roboto", "normal");
    const mlLines = doc.splitTextToSize(mentionsLegales, pageWidth - 40);
    const mlHeight = mlLines.length * 3.5;
    doc.text(mlLines, 20, pageHeight - 18 - mlHeight);
    footerY = pageHeight - 10;
  }

  if (conditions) {
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("Roboto", "normal");
    const conditionsLines = doc.splitTextToSize(conditions, pageWidth - 40);
    const condY = mentionsLegales ? pageHeight - 45 : pageHeight - 30;
    doc.text(conditionsLines, 20, condY);
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Document généré par Operioz", pageWidth / 2, footerY, { align: "center" });
}

function addCgvPage(doc: jsPDF, cgv: string): void {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(41, 128, 185);
  doc.text("Conditions Générales de Vente", pageWidth / 2, 25, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(cgv, pageWidth - 40);
  doc.text(lines, 20, 40);
}

export function generateDevisPDF(artisan: Artisan, client: Client, devis: DevisData, options?: PdfOptions): void {
  const doc = new jsPDF();
  registerFonts(doc);

  renderHeaderBand(doc, artisan, "DEVIS", devis.numero);

  const yArtisanEnd = renderArtisanBlock(doc, artisan, BLOCKS_TOP_Y);
  const yClientEnd = addClientInfo(doc, client, BLOCKS_TOP_Y);
  let yPos = Math.max(yArtisanEnd, yClientEnd) + 5;

  yPos = addDocumentInfo(doc, devis, "devis", yPos);
  yPos = addLignesTable(doc, devis.lignes, yPos);
  addTotals(doc, devis.totalHT, devis.totalTVA, devis.totalTTC, yPos);
  addFooter(doc, devis.conditions, options?.mentionsLegales);

  if (options?.cgv) {
    addCgvPage(doc, options.cgv);
  }

  doc.save(`Devis_${devis.numero}.pdf`);
}

export function generateFacturePDF(artisan: Artisan, client: Client, facture: FactureData, options?: PdfOptions): void {
  const doc = new jsPDF();
  registerFonts(doc);

  const isAvoir = facture.isAvoir === true;
  const headerType = isAvoir ? "AVOIR" : "FACTURE";

  renderHeaderBand(doc, artisan, headerType, facture.numero);

  let blocksTopY = BLOCKS_TOP_Y;
  if (isAvoir) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...AVOIR_RED);
    doc.rect(0, BAND_H, pageWidth, 10, "F");
    doc.setFontSize(10);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("AVOIR — Document d'annulation", pageWidth / 2, BAND_H + 7, { align: "center" });
    doc.setTextColor(0, 0, 0);
    blocksTopY += 10; // décale les blocs sous le sous-bandeau rouge
  }

  const yArtisanEnd = renderArtisanBlock(doc, artisan, blocksTopY);
  const yClientEnd = addClientInfo(doc, client, blocksTopY);
  let yPos = Math.max(yArtisanEnd, yClientEnd) + 5;

  yPos = addDocumentInfo(doc, facture, "facture", yPos);
  yPos = addLignesTable(doc, facture.lignes, yPos);
  addTotals(doc, facture.totalHT, facture.totalTVA, facture.totalTTC, yPos, facture.montantPaye);
  // OPE-164 — conditions réelles + mention d'escompte B2B (L441-9) sur une facture (pas un avoir).
  const factureConditions = isAvoir
    ? facture.conditions
    : [facture.conditions, "Escompte pour paiement anticipé : néant (Art. L441-9 C. com.)."]
        .filter(Boolean)
        .join("\n");
  addFooter(doc, factureConditions, options?.mentionsLegales);

  // OPE-127 — CGV réutilisables sur une page dédiée (comme le devis). Pas sur un avoir
  // (document d'annulation). N'apparaît que si l'artisan a renseigné ses CGV.
  if (!isAvoir && options?.cgv) {
    addCgvPage(doc, options.cgv);
  }

  const prefix = isAvoir ? "Avoir" : "Facture";
  doc.save(`${prefix}_${facture.numero}.pdf`);
}
