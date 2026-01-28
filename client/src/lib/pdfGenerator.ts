import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Artisan {
  nomEntreprise?: string | null;
  siret?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
}

interface Client {
  nom: string;
  prenom?: string | null;
  entreprise?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
}

interface LigneDocument {
  designation: string;
  description?: string | null;
  quantite: number;
  unite?: string | null;
  prixUnitaire: number;
  tauxTva?: number | null;
}

interface DevisData {
  numero: string;
  dateCreation: Date | string;
  dateValidite?: Date | string | null;
  statut: string;
  objet?: string | null;
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
  lignes: LigneDocument[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  montantPaye?: number | null;
  conditions?: string | null;
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

function addHeader(
  doc: jsPDF,
  artisan: Artisan,
  type: "DEVIS" | "FACTURE",
  numero: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Titre du document
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 128, 185);
  doc.text(type, pageWidth / 2, yPos, { align: "center" });

  // Numéro du document
  yPos += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`N° ${numero}`, pageWidth / 2, yPos, { align: "center" });

  // Informations de l'artisan (gauche)
  yPos += 15;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(artisan.nomEntreprise || "Mon Entreprise", 20, yPos);

  yPos += 6;
  doc.setFont("helvetica", "normal");
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

  return yPos + 10;
}

function addClientInfo(doc: jsPDF, client: Client, yStart: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = yStart;

  // Encadré client
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(pageWidth - 90, yPos - 5, 70, 45, 3, 3, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Client", pageWidth - 85, yPos + 3);

  yPos += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  const clientName = client.entreprise || `${client.prenom || ""} ${client.nom}`.trim();
  doc.text(clientName, pageWidth - 85, yPos);
  yPos += 5;

  if (client.adresse) {
    doc.text(client.adresse, pageWidth - 85, yPos);
    yPos += 5;
  }
  if (client.codePostal || client.ville) {
    doc.text(`${client.codePostal || ""} ${client.ville || ""}`.trim(), pageWidth - 85, yPos);
    yPos += 5;
  }
  if (client.telephone) {
    doc.text(`Tél: ${client.telephone}`, pageWidth - 85, yPos);
    yPos += 5;
  }

  return yStart + 55;
}

function addDocumentInfo(
  doc: jsPDF,
  data: { dateCreation: Date | string; dateValidite?: Date | string | null; dateEcheance?: Date | string | null; statut: string; objet?: string | null },
  type: "devis" | "facture",
  yStart: number
): number {
  let yPos = yStart;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  doc.setFont("helvetica", "bold");
  doc.text("Date d'émission:", 20, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(formatDate(data.dateCreation), 65, yPos);

  yPos += 6;
  if (type === "devis" && data.dateValidite) {
    doc.setFont("helvetica", "bold");
    doc.text("Valide jusqu'au:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(data.dateValidite), 65, yPos);
    yPos += 6;
  } else if (type === "facture" && data.dateEcheance) {
    doc.setFont("helvetica", "bold");
    doc.text("Échéance:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(data.dateEcheance), 65, yPos);
    yPos += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Statut:", 20, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(getStatutLabel(data.statut, type), 65, yPos);

  if (data.objet) {
    yPos += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Objet:", 20, yPos);
    doc.setFont("helvetica", "normal");
    const objetLines = doc.splitTextToSize(data.objet, 150);
    doc.text(objetLines, 45, yPos);
    yPos += objetLines.length * 5;
  }

  return yPos + 10;
}

function addLignesTable(doc: jsPDF, lignes: LigneDocument[], yStart: number): number {
  const tableData = lignes.map((ligne) => [
    ligne.designation,
    ligne.quantite.toString(),
    ligne.unite || "u",
    formatCurrency(ligne.prixUnitaire),
    `${ligne.tauxTva || 20}%`,
    formatCurrency(ligne.quantite * ligne.prixUnitaire),
  ]);

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
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [60, 60, 60],
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

  // Encadré des totaux
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  const boxHeight = montantPaye !== undefined && montantPaye !== null ? 50 : 35;
  doc.roundedRect(pageWidth - 90, yPos, 70, boxHeight, 3, 3, "FD");

  yPos += 8;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  doc.setFont("helvetica", "normal");
  doc.text("Total HT:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalHT), pageWidth - 25, yPos, { align: "right" });

  yPos += 7;
  doc.text("Total TVA:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalTVA), pageWidth - 25, yPos, { align: "right" });

  yPos += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(41, 128, 185);
  doc.text("Total TTC:", pageWidth - 85, yPos);
  doc.text(formatCurrency(totalTTC), pageWidth - 25, yPos, { align: "right" });

  if (montantPaye !== undefined && montantPaye !== null) {
    yPos += 8;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.text("Déjà payé:", pageWidth - 85, yPos);
    doc.text(formatCurrency(montantPaye), pageWidth - 25, yPos, { align: "right" });

    yPos += 7;
    doc.setFont("helvetica", "bold");
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

function addFooter(doc: jsPDF, conditions?: string | null): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  if (conditions) {
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "italic");
    const conditionsLines = doc.splitTextToSize(conditions, pageWidth - 40);
    doc.text(conditionsLines, 20, pageHeight - 30);
  }

  // Ligne de séparation
  doc.setDrawColor(200, 200, 200);
  doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);

  // Texte de pied de page
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Document généré par Artisan MVP", pageWidth / 2, pageHeight - 10, { align: "center" });
}

export function generateDevisPDF(artisan: Artisan, client: Client, devis: DevisData): void {
  const doc = new jsPDF();

  let yPos = addHeader(doc, artisan, "DEVIS", devis.numero);
  yPos = addClientInfo(doc, client, yPos - 35);
  yPos = addDocumentInfo(doc, devis, "devis", yPos);
  yPos = addLignesTable(doc, devis.lignes, yPos);
  addTotals(doc, devis.totalHT, devis.totalTVA, devis.totalTTC, yPos);
  addFooter(doc, devis.conditions);

  doc.save(`Devis_${devis.numero}.pdf`);
}

export function generateFacturePDF(artisan: Artisan, client: Client, facture: FactureData): void {
  const doc = new jsPDF();

  let yPos = addHeader(doc, artisan, "FACTURE", facture.numero);
  yPos = addClientInfo(doc, client, yPos - 35);
  yPos = addDocumentInfo(doc, facture, "facture", yPos);
  yPos = addLignesTable(doc, facture.lignes, yPos);
  addTotals(doc, facture.totalHT, facture.totalTVA, facture.totalTTC, yPos, facture.montantPaye);
  addFooter(doc, facture.conditions);

  doc.save(`Facture_${facture.numero}.pdf`);
}
