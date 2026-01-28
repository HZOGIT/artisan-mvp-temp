import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface DashboardStats {
  caAnnuel: number;
  caAnnuelPrecedent: number;
  evolutionCA: number;
  totalDevis: number;
  devisAcceptes: number;
  tauxConversion: number;
  totalFactures: number;
  facturesPayees: number;
  facturesImpayees: number;
  totalClients: number;
  nouveauxClients: number;
}

interface MonthlyData {
  mois: string;
  ca: number;
  caPrecedent: number;
}

interface TopClient {
  nom: string;
  ca: number;
  nombreFactures: number;
}

interface ExportData {
  stats: DashboardStats;
  monthlyData: MonthlyData[];
  topClients: TopClient[];
  periode: string;
  artisanName: string;
}

export function exportDashboardToPDF(data: ExportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // En-tête
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text('Rapport Statistiques', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(127, 140, 141);
  doc.text(data.artisanName, pageWidth / 2, 28, { align: 'center' });
  doc.text(`Période: ${data.periode}`, pageWidth / 2, 35, { align: 'center' });
  
  // Date de génération
  doc.setFontSize(10);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 42, { align: 'center' });
  
  // Ligne de séparation
  doc.setDrawColor(52, 152, 219);
  doc.setLineWidth(0.5);
  doc.line(20, 48, pageWidth - 20, 48);
  
  // Section Chiffre d'Affaires
  doc.setFontSize(14);
  doc.setTextColor(44, 62, 80);
  doc.text('Chiffre d\'Affaires', 20, 58);
  
  const caData = [
    ['CA Année en cours', formatCurrency(data.stats.caAnnuel)],
    ['CA Année précédente', formatCurrency(data.stats.caAnnuelPrecedent)],
    ['Évolution', `${data.stats.evolutionCA >= 0 ? '+' : ''}${data.stats.evolutionCA.toFixed(1)}%`],
  ];
  
  (doc as any).autoTable({
    startY: 62,
    head: [['Indicateur', 'Valeur']],
    body: caData,
    theme: 'striped',
    headStyles: { fillColor: [52, 152, 219] },
    margin: { left: 20, right: 20 },
  });
  
  // Section Devis
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Devis', 20, currentY);
  
  const devisData = [
    ['Total devis', data.stats.totalDevis.toString()],
    ['Devis acceptés', data.stats.devisAcceptes.toString()],
    ['Taux de conversion', `${data.stats.tauxConversion.toFixed(1)}%`],
  ];
  
  (doc as any).autoTable({
    startY: currentY + 4,
    head: [['Indicateur', 'Valeur']],
    body: devisData,
    theme: 'striped',
    headStyles: { fillColor: [46, 204, 113] },
    margin: { left: 20, right: 20 },
  });
  
  // Section Factures
  currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Factures', 20, currentY);
  
  const facturesData = [
    ['Total factures', data.stats.totalFactures.toString()],
    ['Factures payées', data.stats.facturesPayees.toString()],
    ['Factures impayées', data.stats.facturesImpayees.toString()],
  ];
  
  (doc as any).autoTable({
    startY: currentY + 4,
    head: [['Indicateur', 'Valeur']],
    body: facturesData,
    theme: 'striped',
    headStyles: { fillColor: [155, 89, 182] },
    margin: { left: 20, right: 20 },
  });
  
  // Section Clients
  currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Clients', 20, currentY);
  
  const clientsData = [
    ['Total clients', data.stats.totalClients.toString()],
    ['Nouveaux clients (année)', data.stats.nouveauxClients.toString()],
  ];
  
  (doc as any).autoTable({
    startY: currentY + 4,
    head: [['Indicateur', 'Valeur']],
    body: clientsData,
    theme: 'striped',
    headStyles: { fillColor: [230, 126, 34] },
    margin: { left: 20, right: 20 },
  });
  
  // Nouvelle page pour l'évolution mensuelle
  doc.addPage();
  
  doc.setFontSize(14);
  doc.text('Évolution Mensuelle du CA', 20, 20);
  
  const monthlyTableData = data.monthlyData.map(m => [
    m.mois,
    formatCurrency(m.ca),
    formatCurrency(m.caPrecedent),
    `${m.caPrecedent > 0 ? (((m.ca - m.caPrecedent) / m.caPrecedent) * 100).toFixed(1) : 0}%`
  ]);
  
  (doc as any).autoTable({
    startY: 25,
    head: [['Mois', 'CA Année N', 'CA Année N-1', 'Évolution']],
    body: monthlyTableData,
    theme: 'striped',
    headStyles: { fillColor: [52, 152, 219] },
    margin: { left: 20, right: 20 },
  });
  
  // Top Clients
  currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Top 5 Clients par CA', 20, currentY);
  
  const topClientsData = data.topClients.map((c, i) => [
    `${i + 1}`,
    c.nom,
    formatCurrency(c.ca),
    c.nombreFactures.toString()
  ]);
  
  (doc as any).autoTable({
    startY: currentY + 4,
    head: [['Rang', 'Client', 'CA Total', 'Nb Factures']],
    body: topClientsData,
    theme: 'striped',
    headStyles: { fillColor: [46, 204, 113] },
    margin: { left: 20, right: 20 },
  });
  
  // Pied de page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(127, 140, 141);
    doc.text(
      `Page ${i} / ${pageCount} - Artisan MVP`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  doc.save(`rapport-statistiques-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportDashboardToCSV(data: ExportData): void {
  const lines: string[] = [];
  
  // En-tête
  lines.push('Rapport Statistiques - ' + data.artisanName);
  lines.push('Période: ' + data.periode);
  lines.push('Généré le: ' + new Date().toLocaleDateString('fr-FR'));
  lines.push('');
  
  // Chiffre d'Affaires
  lines.push('=== CHIFFRE D\'AFFAIRES ===');
  lines.push('Indicateur;Valeur');
  lines.push(`CA Année en cours;${data.stats.caAnnuel}`);
  lines.push(`CA Année précédente;${data.stats.caAnnuelPrecedent}`);
  lines.push(`Évolution;${data.stats.evolutionCA}%`);
  lines.push('');
  
  // Devis
  lines.push('=== DEVIS ===');
  lines.push('Indicateur;Valeur');
  lines.push(`Total devis;${data.stats.totalDevis}`);
  lines.push(`Devis acceptés;${data.stats.devisAcceptes}`);
  lines.push(`Taux de conversion;${data.stats.tauxConversion}%`);
  lines.push('');
  
  // Factures
  lines.push('=== FACTURES ===');
  lines.push('Indicateur;Valeur');
  lines.push(`Total factures;${data.stats.totalFactures}`);
  lines.push(`Factures payées;${data.stats.facturesPayees}`);
  lines.push(`Factures impayées;${data.stats.facturesImpayees}`);
  lines.push('');
  
  // Clients
  lines.push('=== CLIENTS ===');
  lines.push('Indicateur;Valeur');
  lines.push(`Total clients;${data.stats.totalClients}`);
  lines.push(`Nouveaux clients;${data.stats.nouveauxClients}`);
  lines.push('');
  
  // Évolution mensuelle
  lines.push('=== ÉVOLUTION MENSUELLE ===');
  lines.push('Mois;CA Année N;CA Année N-1;Évolution');
  data.monthlyData.forEach(m => {
    const evolution = m.caPrecedent > 0 ? (((m.ca - m.caPrecedent) / m.caPrecedent) * 100).toFixed(1) : '0';
    lines.push(`${m.mois};${m.ca};${m.caPrecedent};${evolution}%`);
  });
  lines.push('');
  
  // Top Clients
  lines.push('=== TOP 5 CLIENTS ===');
  lines.push('Rang;Client;CA Total;Nb Factures');
  data.topClients.forEach((c, i) => {
    lines.push(`${i + 1};${c.nom};${c.ca};${c.nombreFactures}`);
  });
  
  const csvContent = lines.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `rapport-statistiques-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}
