import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatCurrency, type CommandeFournisseur, type RapportCommande, type Artisan } from "../domain/rapport-commande";

// Génération PDF (couche présentation/export, hors domaine car effet de bord `doc.save`). Utilise la forme
// FONCTION typée `autoTable(doc, opts)` de jspdf-autotable (pas l'augmentation de prototype non typée),
// d'où aucun cast permissif. Les libellés du document sont des chaînes de gabarit (artefact d'export).

// jspdf-autotable pose `lastAutoTable` sur l'instance ; on la lit via un type explicite (pas de cast large).
type DocWithLastAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };
function lastFinalY(doc: jsPDF, fallback: number): number {
  return (doc as DocWithLastAutoTable).lastAutoTable?.finalY ?? fallback;
}

// Bon de commande d'UN fournisseur.
export function exportBonCommande(commande: CommandeFournisseur, artisan: Artisan | undefined): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text("Bon de Commande", pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (artisan) {
    doc.text(artisan.nomEntreprise || "", 20, 35);
    doc.text(artisan.adresse || "", 20, 40);
    doc.text(`${artisan.codePostal || ""} ${artisan.ville || ""}`, 20, 45);
    doc.text(`Tél: ${artisan.telephone || ""}`, 20, 50);
  }

  doc.setFontSize(12);
  doc.setTextColor(44, 62, 80);
  doc.text("Fournisseur:", pageWidth - 80, 35);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (commande.fournisseur) {
    doc.text(commande.fournisseur.nom, pageWidth - 80, 42);
    if (commande.fournisseur.contact) doc.text(`Contact: ${commande.fournisseur.contact}`, pageWidth - 80, 47);
    if (commande.fournisseur.email) doc.text(commande.fournisseur.email, pageWidth - 80, 52);
    if (commande.fournisseur.telephone) doc.text(`Tél: ${commande.fournisseur.telephone}`, pageWidth - 80, 57);
  } else {
    doc.text("Fournisseur non défini", pageWidth - 80, 42);
  }

  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString("fr-FR")}`, 20, 65);
  doc.setDrawColor(52, 152, 219);
  doc.setLineWidth(0.5);
  doc.line(20, 70, pageWidth - 20, 70);

  autoTable(doc, {
    startY: 75,
    head: [["Référence", "Désignation", "Quantité", "Prix Unit.", "Total"]],
    body: commande.lignes.map((ligne) => [
      ligne.articleFournisseur?.referenceExterne || ligne.stock.reference,
      ligne.stock.designation,
      `${ligne.quantiteACommander} ${ligne.stock.unite}`,
      formatCurrency(ligne.prixUnitaire),
      formatCurrency(ligne.montantTotal),
    ]),
    theme: "striped",
    headStyles: { fillColor: [52, 152, 219] },
    margin: { left: 20, right: 20 },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 30, halign: "right" }, 4: { cellWidth: 30, halign: "right" } },
  });

  const finalY = lastFinalY(doc, 75) + 10;
  doc.setFontSize(14);
  doc.setTextColor(44, 62, 80);
  doc.text(`Total Commande: ${formatCurrency(commande.totalCommande)}`, pageWidth - 20, finalY, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(127, 140, 141);
  doc.text("Document généré par Operioz", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

  const fournisseurNom = commande.fournisseur?.nom || "sans-fournisseur";
  doc.save(`bon-commande-${fournisseurNom.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`);
}

// Rapport global (un fournisseur par page + page de résumé).
export function exportRapportGlobal(rapport: RapportCommande): void {
  if (rapport.length === 0) return;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let isFirstPage = true;

  for (const commande of rapport) {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    doc.setFontSize(18);
    doc.setTextColor(44, 62, 80);
    doc.text("Rapport de Commande Fournisseur", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(14);
    doc.text(commande.fournisseur?.nom || "Articles sans fournisseur", 20, 35);

    if (commande.fournisseur) {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      if (commande.fournisseur.contact) doc.text(`Contact: ${commande.fournisseur.contact}`, 20, 42);
      if (commande.fournisseur.email) doc.text(`Email: ${commande.fournisseur.email}`, 20, 47);
      if (commande.fournisseur.telephone) doc.text(`Tél: ${commande.fournisseur.telephone}`, 20, 52);
    }

    autoTable(doc, {
      startY: commande.fournisseur ? 58 : 42,
      head: [["Réf.", "Désignation", "Stock", "Seuil", "À commander", "Montant"]],
      body: commande.lignes.map((ligne) => [
        ligne.articleFournisseur?.referenceExterne || ligne.stock.reference,
        ligne.stock.designation,
        `${ligne.stock.quantiteEnStock} ${ligne.stock.unite}`,
        `${ligne.stock.seuilAlerte} ${ligne.stock.unite}`,
        `${ligne.quantiteACommander} ${ligne.stock.unite}`,
        formatCurrency(ligne.montantTotal),
      ]),
      theme: "striped",
      headStyles: { fillColor: [231, 76, 60] },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 8 },
    });

    const finalY = lastFinalY(doc, 58) + 8;
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(`Total: ${formatCurrency(commande.totalCommande)}`, pageWidth - 20, finalY, { align: "right" });
  }

  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(44, 62, 80);
  doc.text("Résumé Global", pageWidth / 2, 20, { align: "center" });

  const totalGlobal = rapport.reduce((sum, c) => sum + c.totalCommande, 0);
  const summaryData = rapport.map((c) => [c.fournisseur?.nom || "Sans fournisseur", c.lignes.length.toString(), formatCurrency(c.totalCommande)]);
  summaryData.push(["TOTAL", "", formatCurrency(totalGlobal)]);

  autoTable(doc, {
    startY: 30,
    head: [["Fournisseur", "Nb Articles", "Montant"]],
    body: summaryData,
    theme: "striped",
    headStyles: { fillColor: [52, 152, 219] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`rapport-commande-global-${new Date().toISOString().split("T")[0]}.pdf`);
}
