import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Download, FileText, Calculator, TrendingUp, TrendingDown, Euro, FileDown, FileSpreadsheet, Eye, FileCode, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/modern/shared/ui/badge";
import { toast } from "sonner";
import { useComptabilite } from "../application/use-comptabilite";
import {
  balanceTotals,
  ligneSoldeNet,
  toCsv,
  type CsvRow,
  type GrandLivreCompte,
  type GrandLivreEcriture,
  type JournalEcriture,
  type BalanceLine,
} from "../domain/comptabilite";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";

// Page Comptabilité & Exports du FRONT NEUF (`/v2/comptabilite`) — clean-archi : présentation pure
// (lecture seule). Les 6 rapports viennent de `useComptabilite` (couche application, seule à importer
// tRPC) ; totaux balance & sérialisation CSV via le domaine (`../domain/comptabilite`, fonctions pures
// testées). Parité visuelle stricte : JSX/Tailwind à l'identique. Libellés via i18n (`comptabilite`).
// Les exports FEC/CSV-serveur/PDF/Factur-X passent par des endpoints REST de téléchargement (pas tRPC).

export default function ComptabilitePage() {
  const { t } = useTranslation("comptabilite");
  const [dateDebut, setDateDebut] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateFin, setDateFin] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

  const {
    grandLivre, loadingGL,
    balance, loadingBalance,
    rapportTVA, loadingTVA,
    journalVentes, loadingJV,
    fecPreview, loadingFec,
    tvaDetail,
  } = useComptabilite(dateDebut, dateFin);

  const conf = fecPreview?.conformite;

  const formatMontant = (montant: number | string | null) => {
    const num = typeof montant === 'string' ? parseFloat(montant) : (montant || 0);
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  // Téléchargement CSV : sérialisation déléguée au domaine (pure, testée), déclenchement DOM côté UI.
  const exportCSV = (rows: CsvRow[], filename: string) => {
    const csvContent = toCsv(rows);
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const downloadFec = () => {
    const url = `/api/comptabilite/fec?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    toast.success(t("toastFec"));
  };

  const downloadCsv = () => {
    const url = `/api/comptabilite/export-csv?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    toast.success(t("toastCsv"));
  };

  const downloadPdfLot = () => {
    const url = `/api/comptabilite/export-pdf-lot?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    toast.success(t("toastPdf"));
  };

  const downloadFacturxLot = () => {
    const url = `/api/comptabilite/export-facturx-lot?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    toast.success(t("toastFacturx"));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Bandeau de conformité FEC */}
      {conf && (
        <Card className={conf.equilibre && conf.erreurs.length === 0 ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {conf.equilibre && conf.erreurs.length === 0 ? (
                <Badge className="bg-green-600 hover:bg-green-600 gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {t("conformeFec")}</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {t("desequilibre")}</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">{conf.nbEcritures}</strong> {t("ecritures")}{" · "}<strong className="text-foreground">{conf.nbLignes}</strong> {t("lignes")}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("debitTotal")} <strong className="text-foreground">{formatMontant(conf.totalDebit)}</strong>
              </span>
              <span className="text-sm text-muted-foreground">
                {t("creditTotal")} <strong className="text-foreground">{formatMontant(conf.totalCredit)}</strong>
              </span>
              <span className="text-sm">
                {conf.equilibre ? <span className="text-green-600 font-medium">{t("equilibre")}</span> : <span className="text-red-600 font-medium">{t("ecartLabel")} {formatMontant(conf.ecart)}</span>}
              </span>
            </div>
            {conf.erreurs.length > 0 && (
              <ul className="mt-3 text-sm text-red-600 list-disc list-inside">
                {conf.erreurs.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filtres de période */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>{t("dateDebutLabel")}</Label>
              <Input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("dateFinLabel")}</Label>
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
                {t("thisMonth")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const q = Math.floor(now.getMonth() / 3);
                  setDateDebut(format(new Date(now.getFullYear(), q * 3, 1), "yyyy-MM-dd"));
                  setDateFin(format(new Date(now.getFullYear(), q * 3 + 3, 0), "yyyy-MM-dd"));
                }}
              >
                {t("thisQuarter")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateDebut(format(startOfYear(new Date()), "yyyy-MM-dd"));
                  setDateFin(format(endOfYear(new Date()), "yyyy-MM-dd"));
                }}
              >
                {t("thisYear")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résumé TVA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("tvaCollectee")}</CardTitle>
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
            <CardTitle className="text-sm font-medium">{t("tvaDeductible")}</CardTitle>
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
            <CardTitle className="text-sm font-medium">{t("tvaNette")}</CardTitle>
            <Euro className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingTVA ? "..." : formatMontant(rapportTVA?.tvaNette || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Déclaration TVA (CA3) */}
      {tvaDetail && tvaDetail.parTaux.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" /> {t("ca3Title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("thTaux")}</TableHead>
                  <TableHead className="text-right">{t("thBaseHT")}</TableHead>
                  <TableHead className="text-right">{t("thTvaCollectee")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tvaDetail.parTaux.map((row) => (
                  <TableRow key={row.taux}>
                    <TableCell className="font-medium">{row.taux} %</TableCell>
                    <TableCell className="text-right">{formatMontant(row.baseHT)}</TableCell>
                    <TableCell className="text-right">{formatMontant(row.tvaCollectee)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">{t("ca3TvaCollectee")}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatMontant(tvaDetail.tvaCollectee)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">{t("ca3TvaDeductible")}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">- {formatMontant(tvaDetail.tvaDeductible)}</TableCell>
                </TableRow>
                <TableRow className="bg-muted/40">
                  <TableCell className="font-bold">{t("ca3TvaAPayer")}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right font-bold">{formatMontant(tvaDetail.tvaNette)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Onglets */}
      <Tabs defaultValue="balance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="balance">{t("tabBalance")}</TabsTrigger>
          <TabsTrigger value="grandlivre">{t("tabGrandLivre")}</TabsTrigger>
          <TabsTrigger value="journal">{t("tabJournal")}</TabsTrigger>
          <TabsTrigger value="exports">{t("tabExports")}</TabsTrigger>
        </TabsList>

        <TabsContent value="balance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                {t("balanceTitle")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => balance && exportCSV(balance.map((l: BalanceLine): CsvRow => ({
                  compte: l.numeroCompte,
                  libelle: l.libelleCompte,
                  debit: l.debit,
                  credit: l.credit,
                  solde: ligneSoldeNet(l),
                })), 'balance')}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("exportCsv")}
              </Button>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <p className="text-muted-foreground">{t("loading")}</p>
              ) : balance && balance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("thCompte")}</TableHead>
                      <TableHead>{t("thLibelle")}</TableHead>
                      <TableHead className="text-right">{t("thDebit")}</TableHead>
                      <TableHead className="text-right">{t("thCredit")}</TableHead>
                      <TableHead className="text-right">{t("thSolde")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balance.map((ligne: BalanceLine, idx: number) => {
                      // DTO LigneBalance : numeroCompte/libelleCompte + solde net (débiteur−créditeur).
                      // Le legacy lisait compte/libelle/solde (inexistants) → colonnes vides + 0 €. Corrigé.
                      const solde = ligneSoldeNet(ligne);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{ligne.numeroCompte}</TableCell>
                          <TableCell>{ligne.libelleCompte}</TableCell>
                          <TableCell className="text-right">{formatMontant(ligne.debit)}</TableCell>
                          <TableCell className="text-right">{formatMontant(ligne.credit)}</TableCell>
                          <TableCell className={`text-right font-medium ${solde >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatMontant(solde)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(() => {
                      const tot = balanceTotals(balance);
                      return (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={2}>{t("total")}</TableCell>
                          <TableCell className="text-right">{formatMontant(tot.debit)}</TableCell>
                          <TableCell className="text-right">{formatMontant(tot.credit)}</TableCell>
                          <TableCell className="text-right">{formatMontant(tot.solde)}</TableCell>
                        </TableRow>
                      );
                    })()}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {t("emptyEcritures")}
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
                {t("glTitle")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (grandLivre) {
                    const flatData: CsvRow[] = grandLivre.flatMap((gl: GrandLivreCompte) =>
                      gl.ecritures.map((e: GrandLivreEcriture) => ({
                        compte: gl.numeroCompte,
                        libelleCompte: gl.libelleCompte,
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
                {t("exportCsv")}
              </Button>
            </CardHeader>
            <CardContent>
              {loadingGL ? (
                <p className="text-muted-foreground">{t("loading")}</p>
              ) : grandLivre && grandLivre.length > 0 ? (
                <div className="space-y-6">
                  {grandLivre.map((compte: GrandLivreCompte, idx: number) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          {/* DTO CompteGrandLivre : numeroCompte/libelleCompte + totalDebit/totalCredit.
                              Le legacy lisait compte/libelle/soldeDebit/soldeCredit (inexistants) → vide/0 €. Corrigé. */}
                          <span className="font-mono font-bold">{compte.numeroCompte}</span>
                          <span className="ml-2 text-muted-foreground">{compte.libelleCompte}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-green-600 mr-4">{t("dLabel")} {formatMontant(compte.totalDebit)}</span>
                          <span className="text-red-600">{t("cLabel")} {formatMontant(compte.totalCredit)}</span>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("thDate")}</TableHead>
                            <TableHead>{t("thLibelle")}</TableHead>
                            <TableHead>{t("thPiece")}</TableHead>
                            <TableHead className="text-right">{t("thDebit")}</TableHead>
                            <TableHead className="text-right">{t("thCredit")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {compte.ecritures.map((ecriture: GrandLivreEcriture, eIdx: number) => (
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
                  {t("emptyEcritures")}
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
                {t("journalTitle")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => journalVentes && exportCSV(journalVentes.map((e: JournalEcriture): CsvRow => ({
                  date: format(new Date(e.dateEcriture), 'dd/MM/yyyy'),
                  compte: e.numeroCompte,
                  libelle: e.libelle,
                  piece: e.pieceRef,
                  debit: e.debit,
                  credit: e.credit
                })), 'journal_ventes')}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("exportCsv")}
              </Button>
            </CardHeader>
            <CardContent>
              {loadingJV ? (
                <p className="text-muted-foreground">{t("loading")}</p>
              ) : journalVentes && journalVentes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("thDate")}</TableHead>
                      <TableHead>{t("thCompte")}</TableHead>
                      <TableHead>{t("thLibelle")}</TableHead>
                      <TableHead>{t("thPiece")}</TableHead>
                      <TableHead className="text-right">{t("thDebit")}</TableHead>
                      <TableHead className="text-right">{t("thCredit")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalVentes.map((ecriture: JournalEcriture, idx: number) => (
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
                  {t("emptyVentes")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={downloadFec}>
                <CardContent className="pt-6 text-center space-y-3">
                  <FileDown className="h-10 w-10 mx-auto text-primary" />
                  <div>
                    <h3 className="font-semibold">{t("genFec")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("fecDesc")}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {t("facturesPeriode", { count: fecPreview?.totalFactures || 0 })}
                  </Badge>
                  <Button className="w-full" onClick={(e) => { e.stopPropagation(); downloadFec(); }}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("downloadTxt")}
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={downloadCsv}>
                <CardContent className="pt-6 text-center space-y-3">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-green-600" />
                  <div>
                    <h3 className="font-semibold">{t("exportCsvFactures")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("csvFacturesDesc")}
                    </p>
                  </div>
                  <Badge variant="outline">{t("excelLibre")}</Badge>
                  <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); downloadCsv(); }}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("downloadCsvBtn")}
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={downloadPdfLot}>
                <CardContent className="pt-6 text-center space-y-3">
                  <FileText className="h-10 w-10 mx-auto text-red-500" />
                  <div>
                    <h3 className="font-semibold">{t("exportPdfLot")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("pdfLotDesc")}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {t("facturesPeriode", { count: fecPreview?.totalFactures || 0 })}
                  </Badge>
                  <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); downloadPdfLot(); }}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("downloadZip")}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Factur-X */}
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={downloadFacturxLot}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <FileCode className="h-10 w-10 text-orange-500 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{t("facturxTitle")}</h3>
                      <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">2026</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("facturxDesc")}
                    </p>
                  </div>
                  <Button variant="outline" onClick={(e) => { e.stopPropagation(); downloadFacturxLot(); }}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("zipXml")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Aperçu FEC */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t("apercuFec")}
                  {fecPreview && (
                    <Badge variant="secondary" className="ml-2">
                      {t("apercuBadge", { factures: fecPreview.totalFactures, ecritures: fecPreview.lines.length })}
                    </Badge>
                  )}
                </CardTitle>
                <Button size="sm" onClick={downloadFec}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("download")}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingFec ? (
                  <p className="text-muted-foreground">{t("loading")}</p>
                ) : fecPreview && fecPreview.lines.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("thNum")}</TableHead>
                          <TableHead>{t("thDate")}</TableHead>
                          <TableHead>{t("thCompte")}</TableHead>
                          <TableHead>{t("thLibelleCompte")}</TableHead>
                          <TableHead>{t("thPiece")}</TableHead>
                          <TableHead>{t("thLibelleEcriture")}</TableHead>
                          <TableHead className="text-right">{t("thDebit")}</TableHead>
                          <TableHead className="text-right">{t("thCredit")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fecPreview.lines.map((line, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{line.ecritureNum}</TableCell>
                            <TableCell className="font-mono text-xs">{line.ecritureDate}</TableCell>
                            <TableCell className="font-mono text-xs">{line.compteNum}</TableCell>
                            <TableCell className="text-xs">{line.compteLib}</TableCell>
                            <TableCell className="font-mono text-xs">{line.pieceRef}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{line.ecritureLib}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {line.debit !== '0,00' ? line.debit : ''}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {line.credit !== '0,00' ? line.credit : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {fecPreview.totalFactures > 10 && (
                      <p className="text-sm text-muted-foreground mt-4 text-center">
                        {t("apercuLimite", { total: fecPreview.totalFactures })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {t("emptyFactures")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
