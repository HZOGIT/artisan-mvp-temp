import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Loader2, Package, Building2, FileDown, AlertTriangle, Printer, Mail } from "lucide-react";
import { toast } from "sonner";
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface CommandeLigne {
  stock: {
    id: number;
    reference: string;
    designation: string;
    quantiteEnStock: string | null;
    seuilAlerte: string | null;
    unite: string | null;
    prixAchat: string | null;
  };
  articleFournisseur: {
    referenceExterne: string | null;
    prixAchat: string | null;
    delaiLivraison: number | null;
  } | null;
  quantiteACommander: number;
  prixUnitaire: number;
  montantTotal: number;
}

interface RapportCommandeFournisseur {
  fournisseur: {
    id: number;
    nom: string;
    contact: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    codePostal: string | null;
    ville: string | null;
  } | null;
  lignes: CommandeLigne[];
  totalCommande: number;
}

export default function RapportCommande() {
  const [selectedFournisseur, setSelectedFournisseur] = useState<number | null>(null);
  
  const { data: rapportCommande, isLoading } = trpc.stocks.getRapportCommande.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  };

  const exportToPDF = (commande: RapportCommandeFournisseur) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(44, 62, 80);
    doc.text('Bon de Commande', pageWidth / 2, 20, { align: 'center' });
    
    // Informations artisan
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    if (artisan) {
      doc.text(artisan.nomEntreprise || '', 20, 35);
      doc.text(artisan.adresse || '', 20, 40);
      doc.text(`${artisan.codePostal || ''} ${artisan.ville || ''}`, 20, 45);
      doc.text(`Tél: ${artisan.telephone || ''}`, 20, 50);
    }
    
    // Informations fournisseur
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text('Fournisseur:', pageWidth - 80, 35);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    if (commande.fournisseur) {
      doc.text(commande.fournisseur.nom, pageWidth - 80, 42);
      if (commande.fournisseur.contact) {
        doc.text(`Contact: ${commande.fournisseur.contact}`, pageWidth - 80, 47);
      }
      if (commande.fournisseur.email) {
        doc.text(commande.fournisseur.email, pageWidth - 80, 52);
      }
      if (commande.fournisseur.telephone) {
        doc.text(`Tél: ${commande.fournisseur.telephone}`, pageWidth - 80, 57);
      }
    } else {
      doc.text('Fournisseur non défini', pageWidth - 80, 42);
    }
    
    // Date
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 20, 65);
    
    // Ligne de séparation
    doc.setDrawColor(52, 152, 219);
    doc.setLineWidth(0.5);
    doc.line(20, 70, pageWidth - 20, 70);
    
    // Tableau des articles
    const tableData = commande.lignes.map(ligne => [
      ligne.articleFournisseur?.referenceExterne || ligne.stock.reference,
      ligne.stock.designation,
      `${ligne.quantiteACommander} ${ligne.stock.unite}`,
      formatCurrency(ligne.prixUnitaire),
      formatCurrency(ligne.montantTotal)
    ]);
    
    (doc as any).autoTable({
      startY: 75,
      head: [['Référence', 'Désignation', 'Quantité', 'Prix Unit.', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [52, 152, 219] },
      margin: { left: 20, right: 20 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' }
      }
    });
    
    // Total
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text(`Total Commande: ${formatCurrency(commande.totalCommande)}`, pageWidth - 20, finalY, { align: 'right' });
    
    // Pied de page
    doc.setFontSize(8);
    doc.setTextColor(127, 140, 141);
    doc.text(
      'Document généré par MonArtisan Pro',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    
    const fournisseurNom = commande.fournisseur?.nom || 'sans-fournisseur';
    doc.save(`bon-commande-${fournisseurNom.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Bon de commande exporté en PDF');
  };

  const exportAllToPDF = () => {
    if (!rapportCommande || rapportCommande.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let isFirstPage = true;
    
    for (const commande of rapportCommande) {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;
      
      // En-tête
      doc.setFontSize(18);
      doc.setTextColor(44, 62, 80);
      doc.text('Rapport de Commande Fournisseur', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(commande.fournisseur?.nom || 'Articles sans fournisseur', 20, 35);
      
      if (commande.fournisseur) {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        if (commande.fournisseur.contact) {
          doc.text(`Contact: ${commande.fournisseur.contact}`, 20, 42);
        }
        if (commande.fournisseur.email) {
          doc.text(`Email: ${commande.fournisseur.email}`, 20, 47);
        }
        if (commande.fournisseur.telephone) {
          doc.text(`Tél: ${commande.fournisseur.telephone}`, 20, 52);
        }
      }
      
      // Tableau
      const tableData = commande.lignes.map(ligne => [
        ligne.articleFournisseur?.referenceExterne || ligne.stock.reference,
        ligne.stock.designation,
        `${ligne.stock.quantiteEnStock} ${ligne.stock.unite}`,
        `${ligne.stock.seuilAlerte} ${ligne.stock.unite}`,
        `${ligne.quantiteACommander} ${ligne.stock.unite}`,
        formatCurrency(ligne.montantTotal)
      ]);
      
      (doc as any).autoTable({
        startY: commande.fournisseur ? 58 : 42,
        head: [['Réf.', 'Désignation', 'Stock', 'Seuil', 'À commander', 'Montant']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [231, 76, 60] },
        margin: { left: 15, right: 15 },
        styles: { fontSize: 8 }
      });
      
      // Total
      const finalY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text(`Total: ${formatCurrency(commande.totalCommande)}`, pageWidth - 20, finalY, { align: 'right' });
    }
    
    // Résumé global sur la dernière page
    doc.addPage();
    doc.setFontSize(18);
    doc.setTextColor(44, 62, 80);
    doc.text('Résumé Global', pageWidth / 2, 20, { align: 'center' });
    
    const summaryData = rapportCommande.map(c => [
      c.fournisseur?.nom || 'Sans fournisseur',
      c.lignes.length.toString(),
      formatCurrency(c.totalCommande)
    ]);
    
    const totalGlobal = rapportCommande.reduce((sum, c) => sum + c.totalCommande, 0);
    summaryData.push(['TOTAL', '', formatCurrency(totalGlobal)]);
    
    (doc as any).autoTable({
      startY: 30,
      head: [['Fournisseur', 'Nb Articles', 'Montant']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [52, 152, 219] },
      margin: { left: 40, right: 40 }
    });
    
    doc.save(`rapport-commande-global-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Rapport global exporté en PDF');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalArticles = rapportCommande?.reduce((sum, c) => sum + c.lignes.length, 0) || 0;
  const totalMontant = rapportCommande?.reduce((sum, c) => sum + c.totalCommande, 0) || 0;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rapport de Commande</h1>
          <p className="text-muted-foreground">
            Articles en rupture de stock à commander auprès des fournisseurs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAllToPDF} disabled={!rapportCommande || rapportCommande.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Exporter tout en PDF
          </Button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Articles à commander</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArticles}</div>
            <p className="text-xs text-muted-foreground">
              en rupture ou stock bas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fournisseurs concernés</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rapportCommande?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              à contacter
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Montant total estimé</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMontant)}</div>
            <p className="text-xs text-muted-foreground">
              HT
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Liste par fournisseur */}
      {(!rapportCommande || rapportCommande.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Aucun article en rupture</h3>
            <p className="text-muted-foreground text-center mt-2">
              Tous vos stocks sont au-dessus du seuil d'alerte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {rapportCommande.map((commande, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle>
                        {commande.fournisseur?.nom || 'Articles sans fournisseur'}
                      </CardTitle>
                      {commande.fournisseur && (
                        <CardDescription>
                          {commande.fournisseur.contact && `Contact: ${commande.fournisseur.contact}`}
                          {commande.fournisseur.email && ` • ${commande.fournisseur.email}`}
                          {commande.fournisseur.telephone && ` • ${commande.fournisseur.telephone}`}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{commande.lignes.length} article(s)</Badge>
                    <Button variant="outline" size="sm" onClick={() => exportToPDF(commande)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Bon de commande
                    </Button>
                    {commande.fournisseur?.email && (
                      <Button variant="outline" size="sm" onClick={() => {
                        window.location.href = `mailto:${commande.fournisseur!.email}?subject=Commande de réapprovisionnement`;
                        toast.info('Ouverture de votre client email...');
                      }}>
                        <Mail className="mr-2 h-4 w-4" />
                        Email
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Désignation</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">Stock</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">À commander</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commande.lignes.map((ligne, ligneIndex) => (
                        <tr key={ligneIndex} className="border-t">
                          <td className="p-2">{ligne.stock.designation}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <Badge variant={Number(ligne.stock.quantiteEnStock) <= 0 ? "destructive" : "outline"}>
                              {ligne.stock.quantiteEnStock} {ligne.stock.unite}
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-medium whitespace-nowrap">
                            {ligne.quantiteACommander} {ligne.stock.unite}
                          </td>
                          <td className="p-2 text-right font-medium whitespace-nowrap">
                            {formatCurrency(ligne.montantTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50">
                      <tr>
                        <td colSpan={3} className="p-2 text-right font-medium">
                          Total commande:
                        </td>
                        <td className="p-2 text-right font-bold text-lg">
                          {formatCurrency(commande.totalCommande)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
