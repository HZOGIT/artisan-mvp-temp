import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, X, ArrowRight,
  Loader2, AlertCircle, Receipt,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function ImportReleve() {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [importDone, setImportDone] = useState<{ releveId: number; nbImportees: number } | null>(null);

  const { data: categories } = trpc.depenses.getCategories.useQuery();
  const { data: transactions, refetch } = trpc.depenses.getTransactionsBancaires.useQuery(
    { releveId: importDone?.releveId || 0 },
    { enabled: !!importDone?.releveId }
  );

  const importMut = trpc.depenses.importReleve.useMutation({
    onSuccess: (res: any) => {
      toast.success(`${res.nbImportees} transaction${res.nbImportees > 1 ? "s" : ""} importée${res.nbImportees > 1 ? "s" : ""}`);
      setImportDone(res);
    },
    onError: (e) => toast.error(e.message || "Échec de l'import"),
  });

  const convertirMut = trpc.depenses.convertirTransaction.useMutation({
    onSuccess: () => {
      toast.success("Transaction convertie en dépense");
      refetch();
    },
  });

  const ignorerMut = trpc.depenses.ignorerTransaction.useMutation({
    onSuccess: () => refetch(),
  });

  function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("CSV trop volumineux (max 1 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setCsvContent(text);
      setFileName(file.name);
      // Preview 5 premières lignes
      const lignes = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
      const sep = (lignes[0]?.match(/;/g)?.length || 0) > (lignes[0]?.match(/,/g)?.length || 0) ? ";" : ",";
      setPreviewRows(lignes.map((l) => l.split(sep).slice(0, 5)));
    };
    reader.readAsText(file, "utf-8");
  }

  function lancerImport() {
    if (!csvContent) {
      toast.error("Charge d'abord un fichier CSV");
      return;
    }
    importMut.mutate({ nomFichier: fileName || "releve.csv", contenuCsv: csvContent });
  }

  // ÉTAPE 3 : afficher les transactions importées avec catégorisation IA
  if (importDone && transactions) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setImportDone(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold flex-1">Transactions importées</h1>
          <Badge variant="default">
            <CheckCircle2 className="h-3 w-3 mr-1" /> {importDone.nbImportees}
          </Badge>
        </div>

        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm">
              <strong>{importDone.nbImportees}</strong> transactions importées depuis <strong>{fileName}</strong>.
              Sélectionne la catégorie de chaque dépense pour les convertir.
            </p>
          </CardContent>
        </Card>

        {transactions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Toutes les transactions ont été traitées.</p>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/depenses">Voir mes dépenses</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((t: any) => (
              <TransactionRow
                key={t.id}
                t={t}
                categories={categories || []}
                onConvertir={(categorie) =>
                  convertirMut.mutate({
                    transactionId: t.id,
                    categorie,
                  })
                }
                onIgnorer={() => ignorerMut.mutate({ id: t.id })}
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
        <Button variant="ghost" size="icon" onClick={() => setLocation("/depenses")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6 text-blue-600" /> Import relevé bancaire
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choisir le fichier CSV</CardTitle>
          <CardDescription>
            Format CSV exporté de ta banque (séparateur <code>;</code> ou <code>,</code>). Date au format JJ/MM/AAAA ou ISO. Max 1 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!csvContent ? (
            <div
              className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50/40"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="h-10 w-10 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium">Cliquer pour choisir un fichier</p>
              <p className="text-xs text-muted-foreground mt-1">CSV uniquement</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-3 rounded border bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 shrink-0" />
                <span className="text-sm font-medium truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({Math.round(csvContent.length / 1024)} KB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCsvContent("");
                  setFileName("");
                  setPreviewRows([]);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Aperçu des 5 premières lignes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr>
                    {previewRows[0]?.map((h, i) => (
                      <th key={i} className="py-1 px-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(1).map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {row.map((c, i) => (
                        <td key={i} className="py-1 px-2 truncate max-w-[200px]">{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <AlertCircle className="h-3 w-3 inline mr-1" /> Le serveur détecte automatiquement la position
              des colonnes Date / Libellé / Montant.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Lancer l'import</CardTitle>
          <CardDescription>
            Les transactions seront importées comme transactions bancaires.
            Tu pourras ensuite les convertir en dépenses ou les ignorer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={lancerImport}
            disabled={!csvContent || importMut.isPending}
            className="w-full min-h-[44px]"
          >
            {importMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Importer
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionRow({
  t,
  categories,
  onConvertir,
  onIgnorer,
}: {
  t: any;
  categories: any[];
  onConvertir: (categorie: string) => void;
  onIgnorer: () => void;
}) {
  const [selectedCat, setSelectedCat] = useState<string>(t.categorie_suggeree || "");

  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{t.libelle}</div>
            <div className="text-xs text-muted-foreground">
              {t.date_transaction ? format(new Date(t.date_transaction), "dd MMM yyyy", { locale: fr }) : "—"}
            </div>
          </div>
          <div className={"text-lg font-bold whitespace-nowrap " + (t.type_transaction === "debit" ? "text-rose-600" : "text-emerald-600")}>
            {t.type_transaction === "debit" ? "−" : "+"}{eur(t.montant)}
          </div>
          <Select value={selectedCat || "none"} onValueChange={(v) => setSelectedCat(v === "none" ? "" : v)}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Catégorie…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Choisir —</SelectItem>
              {categories.map((c: any) => (
                <SelectItem key={c.id} value={c.nom}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.couleur }} />
                    {c.nom}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 w-full md:w-auto">
            <Button
              size="sm"
              onClick={() => selectedCat && onConvertir(selectedCat)}
              disabled={!selectedCat || t.type_transaction === "credit"}
              className="flex-1 md:flex-none"
            >
              <Receipt className="h-3 w-3 mr-1" /> Convertir
            </Button>
            <Button size="sm" variant="outline" onClick={onIgnorer} className="flex-1 md:flex-none">
              <X className="h-3 w-3 mr-1" /> Ignorer
            </Button>
          </div>
        </div>
        {t.categorie_suggeree && !selectedCat && (
          <p className="text-xs text-violet-600 mt-1">
            <ArrowRight className="h-3 w-3 inline" /> Suggestion IA : <strong>{t.categorie_suggeree}</strong>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
