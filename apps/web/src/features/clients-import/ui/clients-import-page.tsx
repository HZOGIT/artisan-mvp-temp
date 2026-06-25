import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, AlertCircle, CheckCircle, Loader2, Download } from "lucide-react";
import { exportToCsv } from "@/shared/lib/csv-export";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { useImportClients } from "../application/use-import-clients";
import { parseRows, validCount, errorCount, toImportPayload, TEMPLATE_ROW, type ClientPreview } from "../domain/clients-import";

/*
 * Page `/clients/import` — migration clean-archi de `pages/ImportClients.tsx`. Markup à l'identique.
 * Lecture/écriture XLSX (effets) en UI ; parsing/validation des lignes en domain (pur, testé).
 */
export default function ClientsImportPage() {
  const { t } = useTranslation("clientsImport");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClientPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMut = useImportClients();

  const resetForm = () => { setFile(null); setPreview([]); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) { toast.error(t("errFormat")); return; }
    setFile(selected);
    setIsLoading(true);
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const sheets = (await readXlsxFile(selected)) as Array<{ data: unknown[][] }>;
      const sheetData = sheets[0].data as unknown[][];
      const [headers, ...dataRows] = sheetData;
      const headerArray = (headers ?? []) as unknown[];
      const rows = dataRows.map(row => Object.fromEntries(headerArray.map((h, i) => [String(h), (row as unknown[])[i]])));
      const clients = parseRows(rows as Record<string, unknown>[]);
      setPreview(clients);
      if (clients.length === 0) { toast.error(t("errAucunValide")); setFile(null); }
      else toast.success(t("comptesToast", { valides: validCount(clients), erreurs: errorCount(clients) }));
    } catch (error) {
      console.error(error);
      toast.error(t("errLecture"));
      resetForm();
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (validCount(preview) === 0) { toast.error(t("errAucunImporter")); return; }
    importMut.mutate(toImportPayload(preview), {
      onSuccess: (result) => {
        toast.success(t("toastImportes", { n: result.imported }));
        if (result.skipped > 0) toast.info(t("toastIgnores", { n: result.skipped }));
        resetForm();
      },
      onError: (error) => toast.error(t("errImport", { msg: error.message })),
    });
  };

  const downloadTemplate = () => {
    const headers = Object.keys(TEMPLATE_ROW);
    const rows = [Object.values(TEMPLATE_ROW).map(String)];
    exportToCsv("modele_clients.csv", headers, rows);
    toast.success(t("modeleTelecharge"));
  };

  const valides = validCount(preview);
  const erreurs = errorCount(preview);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("titre")}</h1>
        <p className="text-muted-foreground">{t("sousTitre")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("selectionnerFichier")}</CardTitle>
          <CardDescription>{t("formatsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                  <p className="mb-2 text-sm font-semibold">{t("cliquerSelectionner")}</p>
                  <p className="text-xs text-muted-foreground">{t("glisserDeposer")}</p>
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} disabled={isLoading} />
              </label>
            </div>
            {file && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{t("kb", { kb: (file.size / 1024).toFixed(2) })}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("apercuClients")}</CardTitle>
            <CardDescription>{t("comptes", { valides, erreurs })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {erreurs > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{t("certainsErreurs")}</AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>{t("colNom")}</TableHead>
                      <TableHead>{t("colPrenom")}</TableHead>
                      <TableHead>{t("colEmail")}</TableHead>
                      <TableHead>{t("colTelephone")}</TableHead>
                      <TableHead>{t("colAdresse")}</TableHead>
                      <TableHead>{t("colVille")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((client, index) => (
                      <TableRow key={index} className={client.status === "error" ? "bg-red-50" : "bg-green-50"}>
                        <TableCell>{client.status === "valid" ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}</TableCell>
                        <TableCell className="font-semibold">{client.nom}</TableCell>
                        <TableCell>{client.prenom || "-"}</TableCell>
                        <TableCell className="text-sm">{client.email || "-"}</TableCell>
                        <TableCell className="text-sm">{client.telephone || "-"}</TableCell>
                        <TableCell className="text-sm">{client.adresse || "-"}</TableCell>
                        <TableCell className="text-sm">{client.ville || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.some((c) => c.error) && (
                <div className="space-y-2">
                  <p className="font-semibold text-sm">{t("erreursDetectees")}</p>
                  {preview.filter((c) => c.error).map((client, index) => (
                    <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded"><strong>{client.nom}</strong> : {client.error ? t(client.error) : ""}</div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleImport} disabled={importMut.isPending || valides === 0}>
                  {importMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("importEnCours")}</> : <><Upload className="w-4 h-4 mr-2" />{t("importerN", { n: valides })}</>}
                </Button>
                <Button variant="outline" onClick={resetForm}>{t("annuler")}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("modeleTitre")}</CardTitle>
          <CardDescription>{t("modeleDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 mr-2" />{t("telechargerModele")}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
