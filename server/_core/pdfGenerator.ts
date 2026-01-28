import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Devis, DevisLigne, Facture, FactureLigne, Artisan, Client } from "../db";

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

export function generateDevisPDF(data: PDFDevisData): Buffer {
  const { devis, artisan, client } = data;
  const doc = new jsPDF();

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
  doc.text("DEVIS", 20, 25);

  // Numéro et date
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
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
  doc.setTextColor(...darkGray);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(artisan.nomEntreprise || "Artisan", 20, 55);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(artisan.adresse || "", 20, 62);
  doc.text(`${artisan.codePostal || ""} ${artisan.ville || ""}`, 20, 68);
  if (artisan.siret) {
    doc.text(`SIRET: ${artisan.siret}`, 20, 74);
  }
  if (artisan.telephone) {
    doc.text(`Tél: ${artisan.telephone}`, 20, 80);
  }
  if (artisan.email) {
    doc.text(`Email: ${artisan.email}`, 20, 86);
  }

  // Informations client
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CLIENT", 120, 55);

  doc.setFont("helvetica", "normal");
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
    },
    bodyStyles: {
      textColor: darkGray,
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

  doc.setFont("helvetica", "normal");
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL TTC: ${total.toFixed(2)} €`, 140, yPosition);

  // Pied de page
  doc.setFont("helvetica", "normal");
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
  doc.text("FACTURE", 20, 25);

  // Numéro et date
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
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
  doc.setTextColor(...darkGray);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(artisan.nomEntreprise || "Artisan", 20, 55);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(artisan.adresse || "", 20, 62);
  doc.text(`${artisan.codePostal || ""} ${artisan.ville || ""}`, 20, 68);
  if (artisan.siret) {
    doc.text(`SIRET: ${artisan.siret}`, 20, 74);
  }
  if (artisan.telephone) {
    doc.text(`Tél: ${artisan.telephone}`, 20, 80);
  }
  if (artisan.email) {
    doc.text(`Email: ${artisan.email}`, 20, 86);
  }

  // Informations client
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CLIENT", 120, 55);

  doc.setFont("helvetica", "normal");
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
    },
    bodyStyles: {
      textColor: darkGray,
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

  doc.setFont("helvetica", "normal");
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL TTC: ${total.toFixed(2)} €`, 140, yPosition);

  // Statut de paiement
  yPosition += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (facture.statut === "payee") {
    doc.setTextColor(...successColor);
    doc.text("✓ FACTURE PAYÉE", 20, yPosition);
  } else {
    doc.setTextColor(239, 68, 68); // Rouge
    doc.text("EN ATTENTE DE PAIEMENT", 20, yPosition);
  }

  // Pied de page
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Conditions de paiement: À réception de la facture",
    20,
    280
  );
  doc.text("Délai de paiement: 30 jours", 20, 285);

  return Buffer.from(doc.output("arraybuffer"));
}
