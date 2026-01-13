import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Calculator, TrendingUp, TrendingDown, Euro } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

export default function Comptabilite() {
  const [dateDebut, setDateDebut] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateFin, setDateFin] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  
  const { data: grandLivre, isLoading: loadingGL } = trpc.comptabilite.getGrandLivre.useQuery({
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
  });
  
  const { data: balance, isLoading: loadingBalance } = trpc.comptabilite.getBalance.useQuery({
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
  });
  
  const { data: rapportTVA, isLoading: loadingTVA } = trpc.comptabilite.getRapportTVA.useQuery({
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
  });
  
  const { data: journalVentes, isLoading: loadingJV } = trpc.comptabilite.getJournalVentes.useQuery({
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
  });

  const formatMontant = (montant: number | string | null) => {
    const num = typeof montant === 'string' ? parseFloat(montant) : (montant || 0);
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const exportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(';'),
      ...data.map(row => headers.map(h => row[h] || '').join(';'))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Comptabilité</h1>
            <p className="text-muted-foreground">
              Grand livre, balance et rapports comptables
            </p>
          </div>
        </div>

        {/* Filtres de période */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateDebut(format(startOfMonth(new Date()), "yyyy-MM-dd"));
                    setDateFin(format(endOfMonth(new Date()), "yyyy-MM-dd"));
                  }}
                >
                  Ce mois
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateDebut(format(startOfYear(new Date()), "yyyy-MM-dd"));
                    setDateFin(format(endOfYear(new Date()), "yyyy-MM-dd"));
                  }}
                >
                  Cette année
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Résumé TVA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TVA Collectée</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {loadingTVA ? "..." : formatMontant(rapportTVA?.tvaCollectee || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TVA Déductible</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {loadingTVA ? "..." : formatMontant(rapportTVA?.tvaDeductible || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TVA Nette à payer</CardTitle>
              <Euro className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingTVA ? "..." : formatMontant(rapportTVA?.tvaNette || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Onglets */}
        <Tabs defaultValue="balance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="balance">Balance</TabsTrigger>
            <TabsTrigger value="grandlivre">Grand Livre</TabsTrigger>
            <TabsTrigger value="journal">Journal des Ventes</TabsTrigger>
          </TabsList>

          <TabsContent value="balance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Balance Comptable
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => balance && exportCSV(balance, 'balance')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {loadingBalance ? (
                  <p className="text-muted-foreground">Chargement...</p>
                ) : balance && balance.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                        <TableHead className="text-right">Solde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balance.map((ligne, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{ligne.compte}</TableCell>
                          <TableCell>{ligne.libelle}</TableCell>
                          <TableCell className="text-right">{formatMontant(ligne.debit)}</TableCell>
                          <TableCell className="text-right">{formatMontant(ligne.credit)}</TableCell>
                          <TableCell className={`text-right font-medium ${ligne.solde >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatMontant(ligne.solde)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={2}>TOTAL</TableCell>
                        <TableCell className="text-right">
                          {formatMontant(balance.reduce((sum, l) => sum + l.debit, 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMontant(balance.reduce((sum, l) => sum + l.credit, 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMontant(balance.reduce((sum, l) => sum + l.solde, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Aucune écriture comptable pour cette période
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="grandlivre">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Grand Livre
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (grandLivre) {
                      const flatData = grandLivre.flatMap(gl => 
                        gl.ecritures.map(e => ({
                          compte: gl.compte,
                          libelleCompte: gl.libelle,
                          date: format(new Date(e.dateEcriture), 'dd/MM/yyyy'),
                          libelle: e.libelle,
                          piece: e.pieceRef,
                          debit: e.debit,
                          credit: e.credit
                        }))
                      );
                      exportCSV(flatData, 'grand_livre');
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {loadingGL ? (
                  <p className="text-muted-foreground">Chargement...</p>
                ) : grandLivre && grandLivre.length > 0 ? (
                  <div className="space-y-6">
                    {grandLivre.map((compte, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <span className="font-mono font-bold">{compte.compte}</span>
                            <span className="ml-2 text-muted-foreground">{compte.libelle}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-green-600 mr-4">D: {formatMontant(compte.soldeDebit)}</span>
                            <span className="text-red-600">C: {formatMontant(compte.soldeCredit)}</span>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Libellé</TableHead>
                              <TableHead>Pièce</TableHead>
                              <TableHead className="text-right">Débit</TableHead>
                              <TableHead className="text-right">Crédit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {compte.ecritures.map((ecriture, eIdx) => (
                              <TableRow key={eIdx}>
                                <TableCell>{format(new Date(ecriture.dateEcriture), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{ecriture.libelle}</TableCell>
                                <TableCell>{ecriture.pieceRef}</TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(ecriture.debit?.toString() || '0') > 0 ? formatMontant(ecriture.debit) : ''}
                                </TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(ecriture.credit?.toString() || '0') > 0 ? formatMontant(ecriture.credit) : ''}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Aucune écriture comptable pour cette période
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journal">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Journal des Ventes
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => journalVentes && exportCSV(journalVentes.map(e => ({
                    date: format(new Date(e.dateEcriture), 'dd/MM/yyyy'),
                    compte: e.numeroCompte,
                    libelle: e.libelle,
                    piece: e.pieceRef,
                    debit: e.debit,
                    credit: e.credit
                  })), 'journal_ventes')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {loadingJV ? (
                  <p className="text-muted-foreground">Chargement...</p>
                ) : journalVentes && journalVentes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Compte</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead>Pièce</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalVentes.map((ecriture, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{format(new Date(ecriture.dateEcriture), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-mono">{ecriture.numeroCompte}</TableCell>
                          <TableCell>{ecriture.libelle}</TableCell>
                          <TableCell>{ecriture.pieceRef}</TableCell>
                          <TableCell className="text-right">
                            {parseFloat(ecriture.debit?.toString() || '0') > 0 ? formatMontant(ecriture.debit) : ''}
                          </TableCell>
                          <TableCell className="text-right">
                            {parseFloat(ecriture.credit?.toString() || '0') > 0 ? formatMontant(ecriture.credit) : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Aucune vente pour cette période
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
