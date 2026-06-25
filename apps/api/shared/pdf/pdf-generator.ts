import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
/** Types d entree structurels (./pdf-input-types) - generateur jsPDF internalise dans le new-stack. */
import type { Devis, DevisLigne, Facture, FactureLigne, Artisan, Client, ContratMaintenance, CommandeFournisseur, LigneCommandeFournisseur, Fournisseur } from "./pdf-input-types";
import { ROBOTO_REGULAR, ROBOTO_BOLD } from "./fonts";
import { TVA_CATEGORIES_MAP } from "../tva/taux-tva-fr";
import type { TvaCategorieId } from "../tva/taux-tva-fr";

/*
 * ============================================================================
 * Layout & palette — single source of truth for the 4 generators
 * ============================================================================
 */

type RGB = [number, number, number];

/** Header band — bleu/marine/vert/violet selon le type de document */
const COLOR_DEVIS: RGB = [30, 64, 175];
const COLOR_FACTURE: RGB = [30, 58, 95];
const COLOR_COMMANDE: RGB = [22, 101, 52];
const COLOR_CONTRAT: RGB = [76, 29, 149];

/** Body palette — neutres slate-* pour un rendu type Stripe / QuickBooks */
const TEXT_DARK: RGB = [31, 41, 55];
const TEXT_BODY: RGB = [55, 65, 81];
const TEXT_MUTED: RGB = [107, 114, 128];
const TABLE_HEAD_BG: RGB = [241, 245, 249];
const TABLE_ALT_BG: RGB = [249, 250, 251];
const DIVIDER: RGB = [226, 232, 240];
const BAND_SUBTEXT: RGB = [219, 224, 235];

/** A4 portrait */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;

/** Header band */
const HEADER_H = 40;
/** marge 10mm à gauche */
const LOGO_X = 10;
/** tient dans une zone 35x28 */
const LOGO_MAX_W = 35;
const LOGO_MAX_H = 28;
/** titre à droite du logo */
const TITLE_X_WITH_LOGO = 50;
/** titre collé à la marge */
const TITLE_X_NO_LOGO = 15;
/** bord droit pour les dates */
const HEADER_RIGHT_X = 200;

/** Tint color toward white (factor=0..1, 1=white) */
function tint(c: RGB, factor: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * factor),
    Math.round(c[1] + (255 - c[1]) * factor),
    Math.round(c[2] + (255 - c[2]) * factor),
  ];
}

/*
 * ============================================================================
 * Fonts — Roboto pour les accents français
 * ============================================================================
 */

function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

/*
 * ============================================================================
 * Image dimensions parser (PNG / JPEG / WEBP) — preserve aspect ratio
 * without adding a dependency.
 * ============================================================================
 */

type ImgFormat = "PNG" | "JPEG" | "WEBP";

function getImageDimensions(buf: Buffer, format: ImgFormat): { width: number; height: number } | null {
  try {
    if (format === "PNG") {
      /** 8-byte signature, then IHDR chunk: 4 length + 4 type + 4 width + 4 height (BE) */
      if (buf.length < 24) return null;
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (format === "JPEG") {
      if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) return null;
        /** Skip 0xFF padding bytes */
        let m = off;
        while (m < buf.length - 1 && buf[m] === 0xff) m++;
        const marker = buf[m];
        off = m + 1;
        /** Standalone markers (no length): SOI, EOI, RST0-7 */
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (off + 1 >= buf.length) return null;
        const segLen = buf.readUInt16BE(off);
        /** SOF markers (frame headers contain dimensions): C0..CF except C4, C8, CC */
        const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) {
          if (off + 7 >= buf.length) return null;
          const height = buf.readUInt16BE(off + 3);
          const width = buf.readUInt16BE(off + 5);
          return { width, height };
        }
        /** length includes itself, so this lands on next 0xFF */
        off += segLen;
      }
      return null;
    }
    if (format === "WEBP") {
      if (buf.length < 30) return null;
      if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
      if (buf.toString("ascii", 8, 12) !== "WEBP") return null;
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8 ") {
        /** After 4-byte size + 3-byte frame tag + 3-byte start code (9D 01 2A): width/height (LE, 14-bit each) */
        return {
          width: buf.readUInt16LE(26) & 0x3fff,
          height: buf.readUInt16LE(28) & 0x3fff,
        };
      }
      if (chunk === "VP8L") {
        /** After 4-byte size + 1-byte signature (0x2F): 4 bytes packing width-1 + height-1 (14-bit each) */
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
      if (chunk === "VP8X") {
        /** After 4-byte size + 1-byte flags + 3-byte reserved: 3-byte width-1 + 3-byte height-1 (LE) */
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width, height };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/*
 * ============================================================================
 * Logo — preserves aspect ratio inside a 35x28mm box centered vertically
 * in the 40mm header band, anchored 10mm from the left edge.
 * ============================================================================
 */

function renderLogo(doc: jsPDF, artisan: Artisan): boolean {
  const logo = artisan.logo;
  if (!logo || typeof logo !== "string") return false;
  const match = logo.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  /** unsupported (e.g. SVG — jsPDF cannot rasterize) */
  if (!match) return false;

  const ext = match[1].toLowerCase();
  const format: ImgFormat = ext === "webp" ? "WEBP" : ext.startsWith("jp") ? "JPEG" : "PNG";

  /** Compute scaled dimensions that fit LOGO_MAX_W x LOGO_MAX_H without stretching. */
  let drawW = LOGO_MAX_W;
  let drawH = LOGO_MAX_H;
  try {
    const buf = Buffer.from(match[2], "base64");
    const dims = getImageDimensions(buf, format);
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
    /** Fall back to max box; addImage will still receive valid base64. */
  }

  /** Center vertically in the 40mm band. */
  const drawY = (HEADER_H - drawH) / 2;

  try {
    doc.addImage(logo, format, LOGO_X, drawY, drawW, drawH);
    return true;
  } catch (err) {
    console.error("[PDF] Logo render failed:", (err as Error).message);
    return false;
  }
}

/*
 * ============================================================================
 * Header band — coloured strip with logo, company name + document title,
 * and optional dates on the right.
 * ============================================================================
 */

interface HeaderOpts {
  primaryColor: RGB;
  artisan: Artisan;
  /** DEVIS, FACTURE, BON DE COMMANDE, CONTRAT DE MAINTENANCE */
  title: string;
  /** e.g. "N° 2025-0042" */
  number?: string;
  /** ['Date: 12/05/2025', 'Validité: 11/06/2025'] */
  dateLines?: string[];
}

function renderHeaderBand(doc: jsPDF, opts: HeaderOpts): void {
  /** Filled coloured band */
  doc.setFillColor(...opts.primaryColor);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  const hasLogo = renderLogo(doc, opts.artisan);
  const titleX = hasLogo ? TITLE_X_WITH_LOGO : TITLE_X_NO_LOGO;

  /** Company name (16pt bold white) */
  doc.setTextColor(255, 255, 255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(17);
  doc.text(opts.artisan.nomEntreprise || "Mon entreprise", titleX, 18);

  /** Document title + number (11pt, légèrement transparent) */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BAND_SUBTEXT);
  const titleLine = opts.number ? `${opts.title}  ·  ${opts.number}` : opts.title;
  doc.text(titleLine, titleX, 27);

  /** Right-aligned date lines */
  if (opts.dateLines && opts.dateLines.length) {
    doc.setFontSize(9);
    let y = 18;
    for (const line of opts.dateLines) {
      doc.text(line, HEADER_RIGHT_X, y, { align: "right" });
      y += 5.5;
    }
  }

  /** Reset text colour for body */
  doc.setTextColor(...TEXT_BODY);
}

/*
 * ============================================================================
 * Info blocks — émetteur (left) + destinataire (right) under the band,
 * with a thin vertical divider.
 * ============================================================================
 */

interface InfoBlock {
  /** 'ÉMETTEUR' / 'CLIENT' / 'FOURNISSEUR' */
  label: string;
  name: string;
  /** body lines (address, phone, email, SIRET, ...) */
  lines: string[];
}

/*
 * ⚠️ Mentions légales obligatoires de l'émetteur (Code de commerce R123-237) :
 * pour une société, forme juridique + capital + RCS (ville + SIREN dérivé du SIRET) ;
 * « RM … » si inscrit au Répertoire des Métiers. Rien d'imposé en plus pour un EI/micro.
 */
export function buildMentionsLegalesEmetteur(artisan: Artisan): string[] {
  const lines: string[] = [];
  const SOCIETES = ["EURL", "SARL", "SAS", "SASU", "SA"];
  if (artisan.formeJuridique && SOCIETES.includes(artisan.formeJuridique)) {
    const siren = artisan.siret ? String(artisan.siret).replace(/\D/g, "").slice(0, 9) : "";
    const cap = artisan.capitalSocial != null && String(artisan.capitalSocial) !== ""
      ? `au capital de ${Number(artisan.capitalSocial).toLocaleString("fr-FR")} €` : "";
    const head = [artisan.formeJuridique, cap].filter(Boolean).join(" ");
    const rcs = artisan.villeRCS && siren ? `RCS ${artisan.villeRCS} ${siren}` : "";
    const line = [head, rcs].filter(Boolean).join(" — ");
    if (line) lines.push(line);
  }
  if (artisan.numeroRM) lines.push(`Inscrit au Répertoire des Métiers — RM ${artisan.numeroRM}`);
  if (artisan.assuranceDecennaleNom && artisan.assuranceDecennalePolice) {
    const zone = artisan.assuranceDecennaleGarantie ? `, garantissant les travaux en ${artisan.assuranceDecennaleGarantie}` : "";
    lines.push(`Assurance décennale : ${artisan.assuranceDecennaleNom} — Police n° ${artisan.assuranceDecennalePolice}${zone}`);
  }
  return lines;
}

function buildArtisanBlock(artisan: Artisan): InfoBlock {
  const lines: string[] = [];
  if (artisan.adresse) lines.push(artisan.adresse);
  const cpVille = `${artisan.codePostal || ""} ${artisan.ville || ""}`.trim();
  if (cpVille) lines.push(cpVille);
  if (artisan.telephone) lines.push(`Tél: ${artisan.telephone}`);
  if (artisan.email) lines.push(`Email: ${artisan.email}`);
  if (artisan.siret) lines.push(`SIRET: ${artisan.siret}`);
  if (artisan.numeroTVA && !artisan.franchiseTVA) lines.push(`TVA: ${artisan.numeroTVA}`);
  if (artisan.codeAPE) lines.push(`APE: ${artisan.codeAPE}`);
  return { label: "ÉMETTEUR", name: artisan.nomEntreprise || "Artisan", lines };
}

function buildClientBlock(client: Client): InfoBlock {
  const lines: string[] = [];
  const personName = `${client.prenom || ""} ${client.nom}`.trim();
  /*
   * Client professionnel : la raison sociale devient l'intitulé,
   * le contact figure en première ligne, et SIRET / n° TVA sont rappelés (mentions B2B).
   */
  const isPro = client.type === "professionnel";
  const raisonSociale = client.raisonSociale;
  if (isPro && raisonSociale && personName) lines.push(`Contact: ${personName}`);
  /*
   * Sur une facture/devis on utilise l'adresse de FACTURATION si renseignée
   * (fallback par champ vers l'adresse principale = adresse de chantier).
   */
  const adrFact = client.adresseFacturation || client.adresse;
  const cpFact = client.codePostalFacturation || client.codePostal;
  const villeFact = client.villeFacturation || client.ville;
  if (adrFact) lines.push(adrFact);
  const cpVille = `${cpFact || ""} ${villeFact || ""}`.trim();
  if (cpVille) lines.push(cpVille);
  if (client.telephone) lines.push(`Tél: ${client.telephone}`);
  if (client.email) lines.push(`Email: ${client.email}`);
  if (isPro && client.siret) lines.push(`SIRET: ${client.siret}`);
  if (isPro && client.numeroTVA) lines.push(`TVA: ${client.numeroTVA}`);
  return {
    label: "CLIENT",
    name: isPro && raisonSociale ? raisonSociale : personName,
    lines,
  };
}

function buildFournisseurBlock(f: Fournisseur): InfoBlock {
  const lines: string[] = [];
  if (f.contact) lines.push(`Contact: ${f.contact}`);
  if (f.adresse) lines.push(f.adresse);
  const cpVille = `${f.codePostal || ""} ${f.ville || ""}`.trim();
  if (cpVille) lines.push(cpVille);
  if (f.telephone) lines.push(`Tél: ${f.telephone}`);
  if (f.email) lines.push(`Email: ${f.email}`);
  return { label: "FOURNISSEUR", name: f.nom ?? "", lines };
}

function renderInfoBlocks(doc: jsPDF, primary: RGB, left: InfoBlock, right: InfoBlock): number {
  const startY = 50;
  const leftX = MARGIN;
  const rightX = 115;
  const dividerX = 105;

  /** Section labels (small caps, primary color) */
  doc.setFont("Roboto", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...primary);
  doc.text(left.label, leftX, startY);
  doc.text(right.label, rightX, startY);

  /** Names (bold dark) */
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text(left.name, leftX, startY + 6);
  doc.text(right.name, rightX, startY + 6);

  /** Body */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  let yLeft = startY + 12;
  let yRight = startY + 12;
  for (const ln of left.lines) {
    doc.text(ln, leftX, yLeft);
    yLeft += 5;
  }
  for (const ln of right.lines) {
    doc.text(ln, rightX, yRight);
    yRight += 5;
  }
  const bottomY = Math.max(yLeft, yRight) + 1;

  /** Vertical divider between blocks */
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.2);
  doc.line(dividerX, startY - 3, dividerX, bottomY);

  /** Reset */
  doc.setTextColor(...TEXT_BODY);
  return bottomY;
}

/*
 * ============================================================================
 * Totals box — tinted background, big TTC, bottom-right.
 * ============================================================================
 */

interface TotalLine {
  label: string;
  value: string;
}

function renderTotalsBox(
  doc: jsPDF,
  primary: RGB,
  startY: number,
  lines: TotalLine[],
  totalLabel: string,
  totalValue: string,
): number {
  const boxW = 80;
  const boxX = PAGE_W - MARGIN - boxW;
  const padX = 5;
  const lineH = 6;
  const boxH = 10 + lines.length * lineH + 12;

  /** Light tint background */
  doc.setFillColor(...tint(primary, 0.92));
  doc.rect(boxX, startY, boxW, boxH, "F");

  /** Body lines */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_BODY);
  let y = startY + 8;
  for (const ln of lines) {
    doc.text(ln.label, boxX + padX, y);
    doc.text(ln.value, boxX + boxW - padX, y, { align: "right" });
    y += lineH;
  }

  /** Separator + total */
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.4);
  doc.line(boxX + padX, y - 2, boxX + boxW - padX, y - 2);

  doc.setFont("Roboto", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...primary);
  doc.text(totalLabel, boxX + padX, y + 5);
  doc.text(totalValue, boxX + boxW - padX, y + 5, { align: "right" });

  return startY + boxH;
}

/*
 * ============================================================================
 * Common autoTable styling
 * ============================================================================
 */

const TABLE_THEME = {
  headStyles: {
    fillColor: TABLE_HEAD_BG,
    textColor: TEXT_DARK,
    fontStyle: "bold" as const,
    halign: "center" as const,
    font: "Roboto",
    lineColor: DIVIDER,
    lineWidth: 0.1,
  },
  bodyStyles: {
    textColor: TEXT_BODY,
    font: "Roboto",
    lineColor: DIVIDER,
    lineWidth: 0.1,
  },
  alternateRowStyles: { fillColor: TABLE_ALT_BG },
};

/*
 * ============================================================================
 * Public types
 * ============================================================================
 */

export interface PDFDevisData {
  devis: Devis & { lignes: DevisLigne[] };
  artisan: Artisan;
  client: Client;
  /*
   * CGV réutilisables (parametres_artisan.conditionsGenerales). Si fournies,
   * ajoutées sur une page dédiée en fin de document.
   */
  cgv?: string | null;
}

export interface PDFFactureData {
  facture: Facture & { lignes: FactureLigne[] };
  artisan: Artisan;
  client: Client;
  /** CGV (cf. PDFDevisData) ; pas sur un avoir. */
  cgv?: string | null;
}

/** Page CGV dédiée, avec saut de page si le texte déborde. Lecture seule, additif. */
function renderCgvPage(doc: jsPDF, cgv: string): void {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(16);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(41, 128, 185);
  doc.text("Conditions Générales de Vente", pageWidth / 2, 25, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(cgv, pageWidth - 2 * MARGIN) as string[];
  let y = 40;
  for (const line of lines) {
    if (y > pageHeight - 15) { doc.addPage(); y = 20; }
    doc.text(line, MARGIN, y);
    y += 4;
  }
}

/*
 * ============================================================================
 * DEVIS
 * ============================================================================
 */

export function generateDevisPDF(data: PDFDevisData): Buffer {
  const { devis, artisan, client } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  const primary = COLOR_DEVIS;

  renderHeaderBand(doc, {
    primaryColor: primary,
    artisan,
    title: "DEVIS",
    number: `N° ${devis.numero}`,
    dateLines: [
      `Date : ${new Date(devis.dateDevis ?? "").toLocaleDateString("fr-FR")}`,
      `Validité : ${devis.dateValidite ? new Date(devis.dateValidite).toLocaleDateString("fr-FR") : "Non définie"}`,
      /** Référence/N° de commande du client (B2B), rappelée si renseignée. */
      ...(devis.referenceClient ? [`Votre réf. : ${devis.referenceClient}`] : []),
    ],
  });

  const blocksEndY = renderInfoBlocks(doc, primary, buildArtisanBlock(artisan), buildClientBlock(client));

  /** Tableau des lignes */
  const tableData = devis.lignes.map((ligne) => {
    /*
     * Section (en-tête de lot, gras) / note (texte libre, italique) en
     * pleine largeur, sans colonnes chiffrées ; exclues des totaux (montants 0).
     */
    const type = ligne.type ?? "produit";
    if (type === "section") {
      return [{ content: ligne.designation ?? "", colSpan: 4, styles: { fontStyle: "bold" as const, fillColor: [226, 232, 240] as [number, number, number], textColor: [30, 41, 59] as [number, number, number] } }];
    }
    if (type === "note") {
      return [{ content: ligne.designation ?? "", colSpan: 4, styles: { fontStyle: "italic" as const, textColor: [100, 100, 100] as [number, number, number] } }];
    }
    const quantite = Number(ligne.quantite) || 0;
    const prixUnitaire = Number(ligne.prixUnitaireHT) || 0;
    const montantHT = ligne.montantHT != null ? Number(ligne.montantHT) : prixUnitaire * quantite;
    return [
      ligne.designation ?? "",
      quantite.toString(),
      `${prixUnitaire.toFixed(2)} €`,
      `${montantHT.toFixed(2)} €`,
    ];
  });

  autoTable(doc, {
    head: [["Désignation", "Quantité", "P.U. HT", "Total HT"]],
    body: tableData,
    startY: blocksEndY + 8,
    ...TABLE_THEME,
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center", cellWidth: 25 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  /*
   * Totaux — lus depuis les champs DB (pré-calculés) pour garantir la cohérence
   * avec ce qui est stocké et éviter tout recalcul divergent côté PDF.
   * TVA ventilée par taux (OPE-58/OPE-487) : si plusieurs taux coexistent (ex. 10% + 20%),
   * on affiche une ligne par taux pour respecter l'obligation légale de ventilation.
   */
  const sousTotal = parseFloat(String(devis.totalHT ?? "0")) || 0;
  const tva = parseFloat(String(devis.totalTVA ?? "0")) || 0;
  const totalTTC = parseFloat(String(devis.totalTTC ?? "0")) || 0;

  const tvaParTaux = new Map<number, number>();
  for (const l of devis.lignes) {
    const taux = Number(l.tauxTVA) || 0;
    const montantTVA = l.montantTVA != null ? Number(l.montantTVA) : (Number(l.montantHT) || 0) * (taux / 100);
    if (taux > 0) tvaParTaux.set(taux, (tvaParTaux.get(taux) ?? 0) + montantTVA);
  }
  const tvaRows: { label: string; value: string }[] =
    tvaParTaux.size > 1
      ? Array.from(tvaParTaux.entries())
          .sort(([a], [b]) => a - b)
          .map(([taux, montant]) => ({ label: `TVA (${taux}%)`, value: `${montant.toFixed(2)} €` }))
      : [{ label: tvaParTaux.size === 1 ? `TVA (${Array.from(tvaParTaux.keys())[0]}%)` : "TVA", value: `${tva.toFixed(2)} €` }];

  const totalsStartY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const totalsEndY = renderTotalsBox(
    doc,
    primary,
    totalsStartY,
    [{ label: "Sous-total HT", value: `${sousTotal.toFixed(2)} €` }, ...tvaRows],
    "TOTAL TTC",
    `${totalTTC.toFixed(2)} €`,
  );

  /** Pied de page */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Conditions de paiement : à réception de la facture.", MARGIN, Math.max(totalsEndY + 12, 280));
  doc.text("Devis valable 30 jours à compter de la date d'émission.", MARGIN, Math.max(totalsEndY + 17, 285));

  /** Pied de page standard */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Conditions de paiement : à réception de la facture.", MARGIN, Math.max(totalsEndY + 12, 280));
  doc.text("Devis valable 30 jours à compter de la date d'émission.", MARGIN, Math.max(totalsEndY + 17, 285));

  /** Mentions légales TVA (franchise en base, autoliquidation) si applicable */
  const tvaDevisMentions = Array.from(
    new Set(
      devis.lignes
        .map((l) => l.tvaCategorieId as string | null | undefined)
        .filter((id): id is string => !!id)
        .map((id) => TVA_CATEGORIES_MAP[id as TvaCategorieId]?.mentionLegale)
        .filter((m): m is string => !!m),
    ),
  );
  let devisMentionY = Math.max(totalsEndY + 23, 291);
  if (tvaDevisMentions.length > 0) {
    doc.setFontSize(8);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(...TEXT_BODY);
    for (const m of tvaDevisMentions) {
      doc.text(m, MARGIN, devisMentionY);
      devisMentionY += 5;
    }
    doc.setFont("Roboto", "normal");
  }

  /** OPE-151 — mentions légales émetteur (société : forme/capital/RCS ; RM si renseigné). */
  const mentions = buildMentionsLegalesEmetteur(artisan);
  if (mentions.length > 0) {
    doc.setFontSize(7);
    let my = devisMentionY;
    for (const m of mentions) {
      doc.text(m, MARGIN, my);
      my += 4;
    }
  }

  /** OPE-127 — CGV sur page dédiée (parité avec le PDF client). N'apparaît que si renseignées. */
  if (data.cgv && String(data.cgv).trim()) renderCgvPage(doc, String(data.cgv));

  return Buffer.from(doc.output("arraybuffer"));
}

/*
 * ============================================================================
 * FACTURE
 * ============================================================================
 */

export function generateFacturePDF(data: PDFFactureData): Buffer {
  const { facture, artisan, client } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  const primary = COLOR_FACTURE;
  const successColor: RGB = [16, 185, 129];
  const dangerColor: RGB = [239, 68, 68];

  /*
   * OPE-165 — un avoir (note de crédit) est un document DISTINCT d'une facture :
   * titré « AVOIR », rappelant la facture d'origine, sans échéance ni mentions de
   * pénalité de retard. Parité avec le générateur PDF client (déjà avoir-aware).
   * typeDocument ∈ { facture, avoir } (défaut « facture ») → comportement inchangé
   * pour toute facture normale (isAvoir = false).
   */
  const isAvoir = facture.typeDocument === "avoir";
  const avoirRed: RGB = [220, 53, 69];

  renderHeaderBand(doc, {
    primaryColor: primary,
    artisan,
    title: isAvoir ? "AVOIR" : "FACTURE",
    number: `N° ${facture.numero}`,
    dateLines: [
      `Date : ${new Date(facture.dateFacture ?? "").toLocaleDateString("fr-FR")}`,
      /*
       * Un avoir n'a pas d'échéance de règlement : on rappelle la facture d'origine
       * (l'objet par défaut d'un avoir = « Avoir sur facture {numéro} »).
       */
      ...(isAvoir
        ? (facture.objet ? [facture.objet] : [])
        : [`Échéance : ${facture.dateEcheance ? new Date(facture.dateEcheance).toLocaleDateString("fr-FR") : "Non définie"}`]),
      /** Référence/N° de commande du client (B2B), rappelée si renseignée. */
      ...(facture.referenceClient ? [`Votre réf. : ${facture.referenceClient}`] : []),
    ],
  });

  /*
   * OPE-165 — sous-bandeau rouge distinctif pour un avoir, placé dans l'espace
   * entre le bandeau d'en-tête (y=HEADER_H) et les blocs émetteur/client (y=50).
   */
  if (isAvoir) {
    doc.setFillColor(...avoirRed);
    doc.rect(0, HEADER_H, PAGE_W, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.text("AVOIR — Document d'annulation", PAGE_W / 2, HEADER_H + 5.5, { align: "center" });
    doc.setTextColor(...TEXT_BODY);
  }

  const blocksEndY = renderInfoBlocks(doc, primary, buildArtisanBlock(artisan), buildClientBlock(client));

  /** Tableau des lignes */
  const tableData = facture.lignes.map((ligne) => {
    /*
     * OPE-168 (volet 2) — section (en-tête de lot, gras) / note (texte libre, italique)
     * en pleine largeur, sans colonnes chiffrées ; exclues des totaux (montants 0).
     */
    const type = ligne.type ?? "produit";
    if (type === "section") {
      return [{ content: ligne.designation ?? "", colSpan: 4, styles: { fontStyle: "bold" as const, fillColor: [226, 232, 240] as [number, number, number], textColor: [30, 41, 59] as [number, number, number] } }];
    }
    if (type === "note") {
      return [{ content: ligne.designation ?? "", colSpan: 4, styles: { fontStyle: "italic" as const, textColor: [100, 100, 100] as [number, number, number] } }];
    }
    const quantite = Number(ligne.quantite) || 0;
    const prixUnitaire = Number(ligne.prixUnitaireHT) || 0;
    const montantHT = ligne.montantHT != null ? Number(ligne.montantHT) : prixUnitaire * quantite;
    return [
      ligne.designation ?? "",
      quantite.toString(),
      `${prixUnitaire.toFixed(2)} €`,
      `${montantHT.toFixed(2)} €`,
    ];
  });

  autoTable(doc, {
    head: [["Désignation", "Quantité", "P.U. HT", "Total HT"]],
    body: tableData,
    startY: blocksEndY + 8,
    ...TABLE_THEME,
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center", cellWidth: 25 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  /*
   * Totaux — lus depuis les champs DB (pré-calculés) pour garantir la cohérence
   * avec ce qui est stocké et éviter tout recalcul divergent côté PDF.
   * TVA ventilée par taux (OPE-58/OPE-487) : si plusieurs taux coexistent (ex. 10% + 20%),
   * on affiche une ligne par taux pour respecter l'obligation légale de ventilation.
   */
  const sousTotal = parseFloat(String(facture.totalHT ?? "0")) || 0;
  const tva = parseFloat(String(facture.totalTVA ?? "0")) || 0;
  const totalTTC = parseFloat(String(facture.totalTTC ?? "0")) || 0;

  const tvaParTauxF = new Map<number, number>();
  for (const l of facture.lignes) {
    const taux = Number(l.tauxTVA) || 0;
    const montantTVA = l.montantTVA != null ? Number(l.montantTVA) : (Number(l.montantHT) || 0) * (taux / 100);
    if (taux > 0) tvaParTauxF.set(taux, (tvaParTauxF.get(taux) ?? 0) + montantTVA);
  }
  const tvaRowsF: { label: string; value: string }[] =
    tvaParTauxF.size > 1
      ? Array.from(tvaParTauxF.entries())
          .sort(([a], [b]) => a - b)
          .map(([taux, montant]) => ({ label: `TVA (${taux}%)`, value: `${montant.toFixed(2)} €` }))
      : [{ label: tvaParTauxF.size === 1 ? `TVA (${Array.from(tvaParTauxF.keys())[0]}%)` : "TVA", value: `${tva.toFixed(2)} €` }];

  const totalsStartY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const totalsEndY = renderTotalsBox(
    doc,
    primary,
    totalsStartY,
    [{ label: "Sous-total HT", value: `${sousTotal.toFixed(2)} €` }, ...tvaRowsF],
    "TOTAL TTC",
    `${totalTTC.toFixed(2)} €`,
  );

  /** Statut */
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  if (isAvoir) {
    /*
     * OPE-165 — un avoir n'a pas de statut de paiement : il vient en déduction
     * ou remboursement, pas « en attente de paiement ».
     */
    doc.setTextColor(...primary);
    doc.text("AVOIR — montant à déduire ou rembourser", MARGIN, totalsStartY + 6);
  } else if (facture.statut === "payee") {
    doc.setTextColor(...successColor);
    doc.text("FACTURE PAYÉE", MARGIN, totalsStartY + 6);
  } else {
    doc.setTextColor(...dangerColor);
    doc.text("EN ATTENTE DE PAIEMENT", MARGIN, totalsStartY + 6);
  }

  /** Pied de page — mentions légales obligatoires */
  let footerY = Math.max(totalsEndY + 14, 258);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_BODY);

  /*
   * OPE-165 — `fy` = ordonnée de la dernière ligne de pied dessinée (avant les
   * mentions légales émetteur). Un avoir n'appelle aucun règlement : pas d'IBAN,
   * pas de conditions de paiement, pas de pénalités de retard ni d'escompte.
   */
  let fy: number;
  if (isAvoir) {
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    const origineObjet = facture.objet ?? "la facture d'origine";
    const avoirNote = doc.splitTextToSize(
      `${origineObjet}. Le présent avoir vient en déduction d'un règlement ultérieur ou donne lieu à remboursement. Un avoir n'a pas d'échéance de paiement.`,
      175,
    ) as string[];
    const noteLines = avoirNote.slice(0, 3);
    doc.text(noteLines, MARGIN, footerY);
    fy = footerY + (noteLines.length - 1) * 4;
  } else {
    if (artisan.iban) {
      doc.setFont("Roboto", "bold");
      doc.text("Règlement par virement bancaire :", MARGIN, footerY);
      doc.setFont("Roboto", "normal");
      doc.text(`IBAN : ${artisan.iban}`, MARGIN, footerY + 4);
      footerY += 10;
    }

    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    /*
     * OPE-164 — condition de paiement RÉELLE de la facture (au lieu du « 30 jours » figé) :
     * `conditionsPaiement` si renseignée, sinon repli sur l'échéance, sinon « à réception ».
     */
    const condRaw = facture.conditionsPaiement && String(facture.conditionsPaiement).trim()
      ? String(facture.conditionsPaiement).trim()
      : (facture.dateEcheance
          ? `Paiement à échéance : ${new Date(facture.dateEcheance).toLocaleDateString("fr-FR")}`
          : "Paiement à réception.");
    const condLines = (doc.splitTextToSize(condRaw, 175) as string[]).slice(0, 2);
    doc.text(condLines, MARGIN, footerY);
    const fyPenalty = footerY + condLines.length * 4;
    doc.text(
      "En cas de retard de paiement, une pénalité de 3 fois le taux d'intérêt légal sera appliquée,",
      MARGIN,
      fyPenalty,
    );
    doc.text(
      "ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (Art. L441-10 C. com.).",
      MARGIN,
      fyPenalty + 4,
    );
    /** OPE-164 — mention d'escompte obligatoire en B2B (Art. L441-9 II 3° C. com.). */
    doc.text(
      "Escompte pour paiement anticipé : néant (Art. L441-9 C. com.).",
      MARGIN,
      fyPenalty + 8,
    );
    fy = fyPenalty + 8;
  }

  /** Mentions légales TVA (franchise en base, autoliquidation) si applicable */
  const tvaFactureMentions = Array.from(
    new Set(
      facture.lignes
        .map((l) => l.tvaCategorieId)
        .filter((id): id is string => !!id)
        .map((id) => TVA_CATEGORIES_MAP[id as TvaCategorieId]?.mentionLegale)
        .filter((m): m is string => !!m),
    ),
  );
  let factureMentionY = fy + 6;
  if (tvaFactureMentions.length > 0) {
    doc.setFontSize(8);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(...TEXT_BODY);
    for (const m of tvaFactureMentions) {
      doc.text(m, MARGIN, factureMentionY);
      factureMentionY += 5;
    }
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7);
  }

  /** OPE-151 — mentions légales émetteur (forme juridique / capital / RCS / RM). */
  const mentions = buildMentionsLegalesEmetteur(artisan);
  for (const m of mentions) {
    doc.text(m, MARGIN, factureMentionY);
    factureMentionY += 4;
  }

  /** OPE-127 — CGV sur page dédiée (parité PDF client) ; PAS sur un avoir (document d'annulation). */
  if (data.cgv && String(data.cgv).trim() && facture.typeDocument !== "avoir") {
    renderCgvPage(doc, String(data.cgv));
  }

  return Buffer.from(doc.output("arraybuffer"));
}

/*
 * ============================================================================
 * CONTRAT DE MAINTENANCE
 * ============================================================================
 */

export interface PDFContratData {
  contrat: ContratMaintenance;
  artisan: Artisan;
  client: Client;
}

const typeLabels: Record<string, string> = {
  maintenance_preventive: "Maintenance préventive",
  entretien: "Entretien",
  depannage: "Dépannage",
  contrat_service: "Contrat de service",
};

const periodiciteLabels: Record<string, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  semestriel: "Semestriel",
  annuel: "Annuel",
};

export function generateContratPDF(data: PDFContratData): Buffer {
  const { contrat, artisan, client } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  const primary = COLOR_CONTRAT;

  renderHeaderBand(doc, {
    primaryColor: primary,
    artisan,
    title: "CONTRAT DE MAINTENANCE",
    number: `Réf : ${contrat.reference}`,
    dateLines: [
      `Type : ${typeLabels[contrat.type || "entretien"] || contrat.type}`,
      `Début : ${new Date(contrat.dateDebut ?? "").toLocaleDateString("fr-FR")}`,
    ],
  });

  const blocksEndY = renderInfoBlocks(doc, primary, buildArtisanBlock(artisan), buildClientBlock(client));

  /** Titre du contrat */
  let y = blocksEndY + 10;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text(contrat.titre ?? "", MARGIN, y);
  y += 8;

  /** Description */
  if (contrat.description) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_BODY);
    const descLines = doc.splitTextToSize(contrat.description ?? "", PAGE_W - 2 * MARGIN);
    doc.text(descLines, MARGIN, y);
    y += descLines.length * 5 + 4;
  }

  /** Détails du contrat */
  const montantHT = parseFloat(String(contrat.montantHT ?? 0));
  const tauxTVA = parseFloat(String(contrat.tauxTVA ?? 20));
  const montantTVA = montantHT * (tauxTVA / 100);
  const montantTTC = montantHT + montantTVA;

  const detailsData = [
    ["Périodicité", periodiciteLabels[contrat.periodicite ?? ""] ?? contrat.periodicite ?? ""],
    ["Date de début", new Date(contrat.dateDebut ?? "").toLocaleDateString("fr-FR")],
    ["Date de fin", contrat.dateFin ? new Date(contrat.dateFin).toLocaleDateString("fr-FR") : "Indéterminée"],
    ["Reconduction tacite", contrat.reconduction ? "Oui" : "Non"],
    ["Préavis de résiliation", `${contrat.preavisResiliation || 1} mois`],
    ["Montant HT", `${montantHT.toFixed(2)} €`],
    [`TVA (${tauxTVA}%)`, `${montantTVA.toFixed(2)} €`],
    ["Montant TTC", `${montantTTC.toFixed(2)} €`],
  ];

  autoTable(doc, {
    body: detailsData,
    startY: y,
    theme: "plain",
    styles: { font: "Roboto", fontSize: 10, textColor: TEXT_BODY, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60, textColor: TEXT_DARK },
      1: { cellWidth: 110 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  /** Conditions particulières */
  if (contrat.conditionsParticulieres) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...primary);
    doc.text("Conditions particulières", MARGIN, y);
    y += 6;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_BODY);
    const condLines = doc.splitTextToSize(contrat.conditionsParticulieres, PAGE_W - 2 * MARGIN);
    doc.text(condLines, MARGIN, y);
    y += condLines.length * 4 + 5;
  }

  /** Signatures */
  if (y < 230) {
    y = Math.max(y + 10, 230);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    doc.text("Le prestataire", 30, y);
    doc.text("Le client", 130, y);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_BODY);
    doc.text(artisan.nomEntreprise || "Artisan", 30, y + 5);
    doc.text(`${client.prenom || ""} ${client.nom}`.trim(), 130, y + 5);

    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.3);
    doc.line(25, y + 25, 90, y + 25);
    doc.line(125, y + 25, 190, y + 25);
  }

  /** Pied de page */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `${artisan.nomEntreprise || ""}${artisan.siret ? ` — SIRET : ${artisan.siret}` : ""}`,
    MARGIN,
    PAGE_H - 12,
  );
  doc.text("Document généré automatiquement — Contrat de maintenance", MARGIN, PAGE_H - 8);

  return Buffer.from(doc.output("arraybuffer"));
}

/*
 * ============================================================================
 * BON D'INTERVENTION / COMPTE-RENDU SIGNÉ (OPE-161)
 * ============================================================================
 * Matérialise en PDF une intervention terminée + sa signature client déjà
 * capturée (interventions_mobile). Rapport FIXE (pas de worksheet paramétrable).
 */

export interface PDFInterventionData {
  /** titre, description, dateDebut, dateFin, adresse, statut, numero? */
  intervention: Record<string, unknown>;
  artisan: Artisan;
  client: Client;
  /** signatureClient (base64), signatureDate, heureArrivee/Depart, notesIntervention */
  mobile?: Record<string, unknown> | null;
  technicienNom?: string | null;
}

export function generateInterventionPDF(data: PDFInterventionData): Buffer {
  const { intervention, artisan, client, mobile, technicienNom } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  const primary = COLOR_COMMANDE;

  const fmtDate = (d: unknown) => (d ? new Date(d as string).toLocaleDateString("fr-FR") : "—");
  const fmtHeure = (d: unknown) =>
    d ? new Date(d as string).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  renderHeaderBand(doc, {
    primaryColor: primary,
    artisan,
    title: "BON D'INTERVENTION",
    number: intervention.numero ? `N° ${intervention.numero}` : `Réf : INT-${intervention.id}`,
    dateLines: [
      `Date : ${fmtDate(intervention.dateDebut)}`,
      ...(technicienNom ? [`Technicien : ${technicienNom}`] : []),
    ],
  });

  const blocksEndY = renderInfoBlocks(doc, primary, buildArtisanBlock(artisan), buildClientBlock(client));

  /** Titre de l'intervention */
  let y = blocksEndY + 10;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text(String(intervention.titre || "Intervention"), MARGIN, y);
  y += 8;

  /** Détails */
  const arrivee = fmtHeure(mobile?.heureArrivee);
  const depart = fmtHeure(mobile?.heureDepart);
  let duree = "—";
  if (mobile?.heureArrivee && mobile?.heureDepart) {
    const mins = Math.round(
      (new Date(mobile.heureDepart as string).getTime() - new Date(mobile.heureArrivee as string).getTime()) / 60000,
    );
    if (mins > 0) duree = `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
  }
  const detailsData: string[][] = [
    ["Date", fmtDate(intervention.dateDebut)],
    ["Statut", intervention.statut === "terminee" ? "Terminée" : String(intervention.statut || "—")],
  ];
  if (intervention.adresse) detailsData.push(["Lieu", String(intervention.adresse)]);
  if (technicienNom) detailsData.push(["Technicien", technicienNom]);
  if (arrivee) detailsData.push(["Heure d'arrivée", arrivee]);
  if (depart) detailsData.push(["Heure de départ", depart]);
  if (duree !== "—") detailsData.push(["Durée sur site", duree]);

  autoTable(doc, {
    body: detailsData,
    startY: y,
    theme: "plain",
    styles: { font: "Roboto", fontSize: 10, textColor: TEXT_BODY, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60, textColor: TEXT_DARK },
      1: { cellWidth: 110 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  /** Travaux réalisés (description + notes terrain) */
  const corps = [intervention.description, mobile?.notesIntervention].filter(Boolean).join("\n\n");
  if (corps) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...primary);
    doc.text("Travaux réalisés", MARGIN, y);
    y += 6;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_BODY);
    const lines = doc.splitTextToSize(corps, PAGE_W - 2 * MARGIN);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4 + 6;
  }

  /** Signature client (image base64 déjà capturée) */
  const sig: string | undefined = mobile?.signatureClient as string | undefined;
  y = Math.max(y + 6, 225);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Signature du client", MARGIN, y);
  if (mobile?.signatureDate) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Signé le ${fmtDate(mobile.signatureDate)}`, MARGIN, y + 5);
  }
  if (sig && /^data:image\/(png|jpe?g);base64,/i.test(sig)) {
    try {
      const fmt = /jpe?g/i.test(sig) ? "JPEG" : "PNG";
      doc.addImage(sig, fmt, MARGIN, y + 8, 60, 25);
    } catch (e) {
      /** signature illisible → on n'embarque pas l'image, le cadre reste */
    }
  }
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 36, MARGIN + 70, y + 36);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BODY);
  doc.text(`${client.prenom || ""} ${client.nom}`.trim(), MARGIN, y + 41);

  /** Pied de page */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `${artisan.nomEntreprise || ""}${artisan.siret ? ` — SIRET : ${artisan.siret}` : ""}`,
    MARGIN,
    PAGE_H - 12,
  );
  doc.text("Document généré automatiquement — Bon d'intervention", MARGIN, PAGE_H - 8);

  return Buffer.from(doc.output("arraybuffer"));
}

/*
 * ============================================================================
 * BON DE COMMANDE FOURNISSEUR
 * ============================================================================
 */

export interface PDFBonCommandeData {
  commande: CommandeFournisseur & { lignes: LigneCommandeFournisseur[] };
  artisan: Artisan;
  fournisseur: Fournisseur;
}

export function generateBonCommandePDF(data: PDFBonCommandeData): Buffer {
  const { commande, artisan, fournisseur } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  const primary = COLOR_COMMANDE;

  const dateLines: string[] = [
    `Date : ${new Date(commande.dateCommande ?? "").toLocaleDateString("fr-FR")}`,
  ];
  if (commande.reference) dateLines.push(`Réf : ${commande.reference}`);

  renderHeaderBand(doc, {
    primaryColor: primary,
    artisan,
    title: "BON DE COMMANDE",
    number: commande.numero ? `N° ${commande.numero}` : undefined,
    dateLines,
  });

  const blocksEndY = renderInfoBlocks(doc, primary, buildArtisanBlock(artisan), buildFournisseurBlock(fournisseur));

  /** Tableau des lignes */
  const tableData = commande.lignes.map((ligne) => {
    const quantite = Number(ligne.quantite) || 0;
    const prixUnitaire = Number(ligne.prixUnitaire) || 0;
    const tauxTVALigne = Number(ligne.tauxTVA) || 20;
    const totalLigne = quantite * prixUnitaire;
    return [
      ligne.designation ?? "",
      quantite.toString(),
      ligne.unite || "unité",
      prixUnitaire > 0 ? `${prixUnitaire.toFixed(2)} €` : "—",
      `${tauxTVALigne.toFixed(0)} %`,
      totalLigne > 0 ? `${totalLigne.toFixed(2)} €` : "—",
    ];
  });

  autoTable(doc, {
    head: [["Désignation", "Qté", "Unité", "P.U. HT", "TVA", "Total HT"]],
    body: tableData,
    startY: blocksEndY + 8,
    ...TABLE_THEME,
    columnStyles: {
      0: { halign: "left", cellWidth: 65 },
      1: { halign: "center", cellWidth: 15 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "center", cellWidth: 15 },
      5: { halign: "right", cellWidth: 30 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  /** Totaux */
  const totalHT =
    Number(commande.totalHT) ||
    commande.lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0);
  const totalTVA =
    Number(commande.totalTVA) ||
    commande.lignes.reduce(
      (sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) * ((Number(l.tauxTVA) || 20) / 100),
      0,
    );
  const totalTTC = Number(commande.totalTTC) || totalHT + totalTVA;

  const totalsStartY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  let yPosition = renderTotalsBox(
    doc,
    primary,
    totalsStartY,
    [
      { label: "Total HT", value: `${totalHT.toFixed(2)} €` },
      { label: "Total TVA", value: `${totalTVA.toFixed(2)} €` },
    ],
    "TOTAL TTC",
    `${totalTTC.toFixed(2)} €`,
  );
  yPosition += 6;

  /** Délai de livraison */
  if (commande.delaiLivraison) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    doc.text("Délai de livraison :", MARGIN, yPosition);
    doc.setFont("Roboto", "normal");
    doc.setTextColor(...TEXT_BODY);
    doc.text(commande.delaiLivraison, MARGIN + 50, yPosition);
    yPosition += 7;
  }

  /** Adresse de livraison */
  if (commande.adresseLivraison) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    doc.text("Adresse de livraison :", MARGIN, yPosition);
    yPosition += 5;
    doc.setFont("Roboto", "normal");
    doc.setTextColor(...TEXT_BODY);
    const addrLines = doc.splitTextToSize(commande.adresseLivraison, PAGE_W - 2 * MARGIN);
    doc.text(addrLines, MARGIN, yPosition);
    yPosition += addrLines.length * 5 + 4;
  }

  /** Notes */
  if (commande.notes) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    doc.text("Notes :", MARGIN, yPosition);
    yPosition += 5;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_BODY);
    const noteLines = doc.splitTextToSize(commande.notes, PAGE_W - 2 * MARGIN);
    doc.text(noteLines, MARGIN, yPosition);
  }

  /** Pied de page */
  doc.setFont("Roboto", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `${artisan.nomEntreprise || ""}${artisan.siret ? ` — SIRET : ${artisan.siret}` : ""}`,
    MARGIN,
    PAGE_H - 12,
  );
  doc.text("Document généré automatiquement — Bon de commande fournisseur", MARGIN, PAGE_H - 8);

  return Buffer.from(doc.output("arraybuffer"));
}
