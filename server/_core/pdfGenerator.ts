import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Devis, DevisLigne, Facture, FactureLigne, Artisan, Client, ContratMaintenance } from "../db";
import { ROBOTO_REGULAR, ROBOTO_BOLD } from "./fonts";

// Register Roboto font for proper French accent support
function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

export interface PDFDevisData {
  devis: Devis & { lignes: DevisLigne[] };
  artisan: Artisan;
  client: Client;
}

export interface PDFFactureData {
  facture: Facture & { lignes: FactureLigne[] };
  artisan: Artisan;
  client: Client;
}

/**
 * Renders the artisan info block (shared between devis and facture).
 * Returns the Y position after the last line.
 */
function renderArtisanInfo(doc: jsPDF, artisan: Artisan, darkGray: [number, number, number]): number {
  doc.setTextColor(...darkGray);
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.text(artisan.nomEntreprise || "Artisan", 20, 55);

  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");

  let y = 62;
  if (artisan.adresse) {
    doc.text(artisan.adresse, 20, y);
    y += 5;
  }
  const cpVille = `${artisan.codePostal || ""} ${artisan.ville || ""}`.trim();
  if (cpVille) {
    doc.text(cpVille, 20, y);
    y += 5;
  }
  if (artisan.telephone) {
    doc.text(`Tél: ${artisan.telephone}`, 20, y);
    y += 5;
  }
  if (artisan.email) {
    doc.text(`Email: ${artisan.email}`, 20, y);
    y += 5;
  }
  // Ligne vide de séparation
  y += 2;
  if (artisan.siret) {
    doc.text(`SIRET: ${artisan.siret}`, 20, y);
    y += 5;
  }
  const a = artisan as any;
  if (a.numeroTVA) {
    doc.text(`TVA Intracom: ${a.numeroTVA}`, 20, y);
    y += 5;
  }
  if (a.codeAPE) {
    doc.text(`Code APE: ${a.codeAPE}`, 20, y);
    y += 5;
  }

  return y;
}

export function generateDevisPDF(data: PDFDevisData): Buffer {
  const { devis, artisan, client } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  // Couleurs
  const primaryColor: [number, number, number] = [41, 128, 185]; // Bleu
  const lightGray: [number, number, number] = [245, 245, 245];
  const darkGray: [number, number, number] = [80, 80, 80];

  // En-tête
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 40, "F");

  // Titre
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont("Roboto", "bold");
  doc.text("DEVIS", 20, 25);

  // Numéro et date
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text(`N° ${devis.numero}`, 150, 15);
  doc.text(
    `Date: ${new Date(devis.dateDevis).toLocaleDateString("fr-FR")}`,
    150,
    22
  );
  doc.text(
    `Validité: ${devis.dateValidite ? new Date(devis.dateValidite).toLocaleDateString("fr-FR") : "Non définie"}`,
    150,
    29
  );

  // Informations artisan
  renderArtisanInfo(doc, artisan, darkGray);

  // Informations client
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.text("CLIENT", 120, 55);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`${client.prenom || ""} ${client.nom}`, 120, 62);
  if (client.adresse) {
    doc.text(client.adresse, 120, 68);
  }
  if (client.codePostal) {
    doc.text(`${client.codePostal} ${client.ville || ""}`, 120, 74);
  }
  if (client.email) {
    doc.text(`Email: ${client.email}`, 120, 80);
  }
  if (client.telephone) {
    doc.text(`Tél: ${client.telephone}`, 120, 86);
  }

  // Tableau des articles
  const tableData = devis.lignes.map((ligne) => {
    const quantite = Number(ligne.quantite) || 0;
    const prixUnitaire = typeof ligne.prixUnitaireHT === 'string' ? parseFloat(ligne.prixUnitaireHT) : Number(ligne.prixUnitaireHT);
    return [
      ligne.designation,
      quantite.toString(),
      `${prixUnitaire.toFixed(2)} €`,
      `${(prixUnitaire * quantite).toFixed(2)} €`,
    ];
  });

  autoTable(doc, {
    head: [["Désignation", "Quantité", "P.U. HT", "Total HT"]],
    body: tableData,
    startY: 100,
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      font: "Roboto",
    },
    bodyStyles: {
      textColor: darkGray,
      font: "Roboto",
    },
    alternateRowStyles: {
      fillColor: lightGray,
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  // Calculs
  const sousTotal = devis.lignes.reduce((sum, ligne) => {
    const quantite = Number(ligne.quantite) || 0;
    const prixUnitaire = typeof ligne.prixUnitaireHT === 'string' ? parseFloat(ligne.prixUnitaireHT) : Number(ligne.prixUnitaireHT);
    return sum + (prixUnitaire * quantite);
  }, 0);
  const tva = sousTotal * (Number(artisan.tauxTVA) / 100);
  const total = sousTotal + tva;

  // Totaux
  let yPosition = (doc as any).lastAutoTable.finalY + 10;

  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`Sous-total: ${sousTotal.toFixed(2)} €`, 140, yPosition);
  yPosition += 7;
  doc.text(
    `TVA (${artisan.tauxTVA}%): ${tva.toFixed(2)} €`,
    140,
    yPosition
  );
  yPosition += 7;

  // Total en gras
  doc.setFont("Roboto", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL TTC: ${total.toFixed(2)} €`, 140, yPosition);

  // Pied de page
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Conditions de paiement: À réception de la facture",
    20,
    280
  );
  doc.text("Validité du devis: 30 jours", 20, 285);

  return Buffer.from(doc.output("arraybuffer"));
}

export function generateFacturePDF(data: PDFFactureData): Buffer {
  const { facture, artisan, client } = data;
  const doc = new jsPDF();
  registerFonts(doc);

  // Couleurs
  const primaryColor: [number, number, number] = [41, 128, 185]; // Bleu
  const lightGray: [number, number, number] = [245, 245, 245];
  const darkGray: [number, number, number] = [80, 80, 80];
  const successColor: [number, number, number] = [16, 185, 129]; // Vert

  // En-tête
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 40, "F");

  // Titre
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont("Roboto", "bold");
  doc.text("FACTURE", 20, 25);

  // Numéro et date
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text(`N° ${facture.numero}`, 150, 15);
  doc.text(
    `Date: ${new Date(facture.dateFacture).toLocaleDateString("fr-FR")}`,
    150,
    22
  );
  doc.text(
    `Échéance: ${facture.dateEcheance ? new Date(facture.dateEcheance).toLocaleDateString("fr-FR") : "Non définie"}`,
    150,
    29
  );

  // Informations artisan
  renderArtisanInfo(doc, artisan, darkGray);

  // Informations client
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.text("CLIENT", 120, 55);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`${client.prenom || ""} ${client.nom}`, 120, 62);
  if (client.adresse) {
    doc.text(client.adresse, 120, 68);
  }
  if (client.codePostal) {
    doc.text(`${client.codePostal} ${client.ville || ""}`, 120, 74);
  }
  if (client.email) {
    doc.text(`Email: ${client.email}`, 120, 80);
  }
  if (client.telephone) {
    doc.text(`Tél: ${client.telephone}`, 120, 86);
  }

  // Tableau des articles
  const tableData = facture.lignes.map((ligne) => [
    ligne.designation,
    (Number(ligne.quantite) || 0).toString(),
    `${Number(ligne.prixUnitaireHT).toFixed(2)} €`,
    `${(Number(ligne.prixUnitaireHT) * (Number(ligne.quantite) || 0)).toFixed(2)} €`,
  ]);

  autoTable(doc, {
    head: [["Désignation", "Quantité", "P.U. HT", "Total HT"]],
    body: tableData,
    startY: 100,
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      font: "Roboto",
    },
    bodyStyles: {
      textColor: darkGray,
      font: "Roboto",
    },
    alternateRowStyles: {
      fillColor: lightGray,
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  // Calculs
  const sousTotal = facture.lignes.reduce(
    (sum, ligne) => sum + Number(ligne.prixUnitaireHT) * (Number(ligne.quantite) || 0),
    0
  );
  const tva = sousTotal * (Number(artisan.tauxTVA) / 100);
  const total = sousTotal + tva;

  // Totaux
  let yPosition = (doc as any).lastAutoTable.finalY + 10;

  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`Sous-total: ${sousTotal.toFixed(2)} €`, 140, yPosition);
  yPosition += 7;
  doc.text(
    `TVA (${artisan.tauxTVA || 20}%): ${tva.toFixed(2)} €`,
    140,
    yPosition
  );
  yPosition += 7;

  // Total en gras
  doc.setFont("Roboto", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL TTC: ${total.toFixed(2)} €`, 140, yPosition);

  // Statut de paiement
  yPosition += 15;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(10);
  if (facture.statut === "payee") {
    doc.setTextColor(...successColor);
    doc.text("FACTURE PAYÉE", 20, yPosition);
  } else {
    doc.setTextColor(239, 68, 68); // Rouge
    doc.text("EN ATTENTE DE PAIEMENT", 20, yPosition);
  }

  // Pied de page — mentions légales obligatoires facture
  const footerY = 260;
  doc.setFont("Roboto", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);

  const a = artisan as any;
  if (a.iban) {
    doc.setFont("Roboto", "bold");
    doc.text("Règlement par virement bancaire :", 20, footerY);
    doc.setFont("Roboto", "normal");
    doc.text(`IBAN: ${a.iban}`, 20, footerY + 4);
  }

  doc.setFont("Roboto", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Paiement à 30 jours.", 20, footerY + 12);
  doc.text(
    "En cas de retard de paiement, une pénalité de 3 fois le taux d'intérêt légal sera appliquée,",
    20,
    footerY + 16
  );
  doc.text(
    "ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (Art. L441-10 C.com).",
    20,
    footerY + 20
  );

  return Buffer.from(doc.output("arraybuffer"));
}

// ============================================================================
// CONTRAT PDF
// ============================================================================
export interface PDFContratData {
  contrat: ContratMaintenance;
  artisan: Artisan;
  client: Client;
}

const typeLabels: Record<string, string> = {
  maintenance_preventive: "Maintenance Préventive",
  entretien: "Entretien",
  depannage: "Dépannage",
  contrat_service: "Contrat de Service",
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

  const primaryColor: [number, number, number] = [41, 128, 185];
  const darkGray: [number, number, number] = [80, 80, 80];

  // En-tête
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("Roboto", "bold");
  doc.text("CONTRAT DE MAINTENANCE", 20, 22);

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text(`Réf: ${contrat.reference}`, 20, 32);
  doc.text(`Type: ${typeLabels[contrat.type || "entretien"] || contrat.type}`, 120, 32);

  // Artisan info
  const artisanEndY = renderArtisanInfo(doc, artisan, darkGray);

  // Client info
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkGray);
  doc.text("CLIENT", 120, 55);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`${client.prenom || ""} ${client.nom}`, 120, 62);
  let cy = 68;
  if (client.adresse) { doc.text(client.adresse, 120, cy); cy += 6; }
  if (client.codePostal) { doc.text(`${client.codePostal} ${client.ville || ""}`, 120, cy); cy += 6; }
  if (client.email) { doc.text(`Email: ${client.email}`, 120, cy); cy += 6; }
  if (client.telephone) { doc.text(`Tél: ${client.telephone}`, 120, cy); cy += 6; }

  // Titre du contrat
  let y = Math.max(artisanEndY, cy) + 10;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primaryColor);
  doc.text(contrat.titre, 20, y);
  y += 10;

  // Description
  if (contrat.description) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...darkGray);
    const descLines = doc.splitTextToSize(contrat.description, 170);
    doc.text(descLines, 20, y);
    y += descLines.length * 5 + 5;
  }

  // Détails du contrat en tableau
  const montantHT = parseFloat(contrat.montantHT || "0");
  const tauxTVA = parseFloat(contrat.tauxTVA || "20");
  const montantTVA = montantHT * (tauxTVA / 100);
  const montantTTC = montantHT + montantTVA;

  const detailsData = [
    ["Périodicité", periodiciteLabels[contrat.periodicite] || contrat.periodicite],
    ["Date de début", new Date(contrat.dateDebut).toLocaleDateString("fr-FR")],
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
    styles: { font: "Roboto", fontSize: 10, textColor: darkGray, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { cellWidth: 110 },
    },
    margin: { left: 20, right: 20 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Conditions particulières
  if (contrat.conditionsParticulieres) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.text("Conditions particulières", 20, y);
    y += 7;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...darkGray);
    const condLines = doc.splitTextToSize(contrat.conditionsParticulieres, 170);
    doc.text(condLines, 20, y);
    y += condLines.length * 4 + 5;
  }

  // Signatures
  if (y < 220) {
    y = Math.max(y + 10, 220);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkGray);
    doc.text("Le prestataire", 30, y);
    doc.text("Le client", 130, y);
    y += 5;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.text(artisan.nomEntreprise || "Artisan", 30, y + 5);
    doc.text(`${client.prenom || ""} ${client.nom}`, 130, y + 5);

    // Lignes de signature
    doc.setDrawColor(180, 180, 180);
    doc.line(25, y + 25, 90, y + 25);
    doc.line(125, y + 25, 190, y + 25);
  }

  // Pied de page
  doc.setFont("Roboto", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`${artisan.nomEntreprise || ""}${artisan.siret ? ` — SIRET: ${artisan.siret}` : ""}`, 20, 285);
  doc.text("Document généré automatiquement — Contrat de maintenance", 20, 289);

  return Buffer.from(doc.output("arraybuffer"));
}
