import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, X, ArrowRight, Loader2, AlertCircle, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useImportReleve } from "../application/use-import-releve";
import { eur, parsePreview, type Transaction, type Categorie, type ImportResult } from "../domain/import-releve";

// Page `import-releve` (import CSV de relevé bancaire) — migration clean-archi de `pages/ImportReleve.tsx`.
// Markup à l'identique. Parsing d'aperçu CSV en domain (pur), tRPC encapsulé dans `use-import-releve`.
export default function ImportRelevePage() {
  const { t } = useTranslation("importReleve");
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [importDone, setImportDone] = useState<ImportResult | null>(null);

  const { categories, transactions, importReleve, convertir, ignorer } = useImportReleve(importDone?.releveId ?? null);

  function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error(t("errVolumineux")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setCsvContent(text);
      setFileName(file.name);
      setPreviewRows(parsePreview(text));
    };
    reader.readAsText(file, "utf-8");
  }

  function lancerImport() {
    if (!csvContent) { toast.error(t("errCharge")); return; }
    importReleve.mutate(
      { nomFichier: fileName || "releve.csv", contenuCsv: csvContent },
      { onSuccess: (res) => { toast.success(t("toastImport", { count: res.nbImportees })); setImportDone(res); }, onError: (e) => toast.error(e.message || t("errImport")) },
    );
  }

  // ÉTAPE 3 : transactions importées
  if (importDone && transactions) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setImportDone(null)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold flex-1">{t("transactionsImportees")}</h1>
          <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" /> {importDone.nbImportees}</Badge>
        </div>

        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm">{t("importDepuis", { nb: importDone.nbImportees, fichier: fileName })}</p>
          </CardContent>
        </Card>

        {transactions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t("toutesTraitees")}</p>
              <Button asChild variant="outline" className="mt-3"><a href="/depenses">{t("voirDepenses")}</a></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                categories={categories}
                onConvertir={(categorie) => convertir.mutate({ transactionId: tx.id, categorie }, { onSuccess: () => toast.success(t("toastConvertie")) })}
                onIgnorer={() => ignorer.mutate({ id: tx.id })}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ÉTAPES 1 + 2 : Upload + preview
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => { window.location.href = "/depenses"; }}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Upload className="h-6 w-6 text-blue-600" /> {t("titre")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("etape1")}</CardTitle>
          <CardDescription>{t("etape1Desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!csvContent ? (
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50/40" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="h-10 w-10 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium">{t("cliquerChoisir")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("csvUniquement")}</p>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-3 rounded border bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 shrink-0" />
                <span className="text-sm font-medium truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{t("kb", { kb: Math.round(csvContent.length / 1024) })}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setCsvContent(""); setFileName(""); setPreviewRows([]); }}><X className="h-4 w-4" /></Button>
            </div>
          )}
        </CardContent>
      </Card>

      {previewRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("etape2")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr>{previewRows[0]?.map((h, i) => (<th key={i} className="py-1 px-2 text-left font-medium">{h}</th>))}</tr>
                </thead>
                <tbody>
                  {previewRows.slice(1).map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {row.map((c, i) => (<td key={i} className="py-1 px-2 truncate max-w-[200px]">{c}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2"><AlertCircle className="h-3 w-3 inline mr-1" /> {t("detectionAuto")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("etape3")}</CardTitle>
          <CardDescription>{t("etape3Desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={lancerImport} disabled={!csvContent || importReleve.isPending} className="w-full min-h-[44px]">
            {importReleve.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("importEnCours")}</> : <><Upload className="h-4 w-4 mr-2" /> {t("importer")}</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionRow({ tx, categories, onConvertir, onIgnorer }: {
  tx: Transaction; categories: Categorie[]; onConvertir: (categorie: string) => void; onIgnorer: () => void;
}) {
  const { t } = useTranslation("importReleve");
  const [selectedCat, setSelectedCat] = useState(tx.categorieSuggeree || "");

  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{tx.libelle}</div>
            <div className="text-xs text-muted-foreground">{tx.dateTransaction ? format(new Date(tx.dateTransaction), "dd MMM yyyy", { locale: fr }) : "—"}</div>
          </div>
          <div className={"text-lg font-bold whitespace-nowrap " + (tx.typeTransaction === "debit" ? "text-rose-600" : "text-emerald-600")}>
            {tx.typeTransaction === "debit" ? "−" : "+"}{eur(tx.montant)}
          </div>
          <Select value={selectedCat || "none"} onValueChange={(v) => setSelectedCat(v === "none" ? "" : v)}>
            <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder={t("categorie")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("choisir")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.nom}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.couleur ?? undefined }} />
                    {c.nom}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 w-full md:w-auto">
            <Button size="sm" onClick={() => selectedCat && onConvertir(selectedCat)} disabled={!selectedCat || tx.typeTransaction === "credit"} className="flex-1 md:flex-none">
              <Receipt className="h-3 w-3 mr-1" /> {t("convertir")}
            </Button>
            <Button size="sm" variant="outline" onClick={onIgnorer} className="flex-1 md:flex-none">
              <X className="h-3 w-3 mr-1" /> {t("ignorer")}
            </Button>
          </div>
        </div>
        {tx.categorieSuggeree && !selectedCat && (
          <p className="text-xs text-violet-600 mt-1">
            <ArrowRight className="h-3 w-3 inline" /> {t("suggestionIa")}<strong>{tx.categorieSuggeree}</strong>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
