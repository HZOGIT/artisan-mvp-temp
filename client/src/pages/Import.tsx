import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Receipt,
  Upload,
  Users as UsersIcon,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// SOURCES disponibles + templates
// ============================================================================

interface SourceErp {
  key: string;
  label: string;
  description: string;
  templates: { kind: ImportKind; href: string }[];
  /** Couleur de fond de la card. */
  bg: string;
}

const SOURCES: SourceErp[] = [
  {
    key: "ebp",
    label: "EBP Bâtiment",
    description: "Logiciel de gestion EBP Bâtiment / Devis-Factures",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    templates: [{ kind: "clients", href: "/templates/template-ebp-clients.csv" }],
  },
  {
    key: "sage",
    label: "Sage 50/100",
    description: "Sage 50 Compta, Sage 100 Gestion Commerciale",
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
    templates: [{ kind: "clients", href: "/templates/template-sage-clients.csv" }],
  },
  {
    key: "ciel",
    label: "Ciel Devis Factures",
    description: "Ciel Compta / Devis Factures",
    bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "pennylane",
    label: "Pennylane",
    description: "Logiciel de comptabilité Pennylane",
    bg: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "batappli",
    label: "Batappli",
    description: "Logiciel de gestion bâtiment Batappli",
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "obat",
    label: "Obat",
    description: "Logiciel de devis-factures pour le BTP",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "tolteck",
    label: "Tolteck",
    description: "Logiciel de devis pour artisans",
    bg: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "csv",
    label: "Fichier CSV universel",
    description: "Tout fichier CSV / Excel — toujours disponible",
    bg: "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800",
    templates: [
      { kind: "clients", href: "/templates/template-universel-clients.csv" },
      { kind: "devis", href: "/templates/template-universel-devis.csv" },
      { kind: "factures", href: "/templates/template-universel-factures.csv" },
    ],
  },
];

type ImportKind = "clients" | "devis" | "factures";

const KIND_META: Record<ImportKind, { label: string; icon: typeof UsersIcon; fields: { key: string; label: string; required?: boolean }[] }> = {
  clients: {
    label: "Clients",
    icon: UsersIcon,
    fields: [
      { key: "nom", label: "Nom", required: true },
      { key: "prenom", label: "Prénom" },
      { key: "email", label: "Email" },
      { key: "telephone", label: "Téléphone" },
      { key: "adresse", label: "Adresse" },
      { key: "codePostal", label: "Code postal" },
      { key: "ville", label: "Ville" },
      { key: "siret", label: "SIRET" },
      { key: "nomEntreprise", label: "Nom entreprise" },
      { key: "notes", label: "Notes" },
    ],
  },
  devis: {
    label: "Devis",
    icon: FileText,
    fields: [
      { key: "numeroDevis", label: "Numéro" },
      { key: "dateDevis", label: "Date (YYYY-MM-DD)" },
      { key: "objetDevis", label: "Objet" },
      { key: "nomClient", label: "Nom client", required: true },
      { key: "totalHT", label: "Total HT" },
      { key: "totalTTC", label: "Total TTC" },
      { key: "statut", label: "Statut" },
      { key: "notes", label: "Notes" },
    ],
  },
  factures: {
    label: "Factures",
    icon: Receipt,
    fields: [
      { key: "numeroFacture", label: "Numéro" },
      { key: "dateFacture", label: "Date (YYYY-MM-DD)" },
      { key: "objetFacture", label: "Objet" },
      { key: "nomClient", label: "Nom client", required: true },
      { key: "totalHT", label: "Total HT" },
      { key: "totalTTC", label: "Total TTC" },
      { key: "statut", label: "Statut" },
      { key: "datePaiement", label: "Date paiement" },
      { key: "modePaiement", label: "Mode paiement" },
    ],
  },
};

// ============================================================================
// Parser CSV minimaliste (separateur auto, gere les "..." quotes)
// Pas de dependance npm — XLSX importerait ~600 KB pour ce besoin simple.
// ============================================================================

function detectSeparator(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = {
    ";": (sample.match(/;/g) || []).length,
    ",": (sample.match(/,/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; sep: string } {
  const sep = detectSeparator(text);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [], sep };
  const headers = parseCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => {
    const cells = parseCsvLine(l, sep);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
  return { headers, rows, sep };
}

// ============================================================================
// Page
// ============================================================================

type Step = 1 | 2 | 3 | 4;

export default function ImportPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<SourceErp | null>(null);
  const [kind, setKind] = useState<ImportKind>("clients");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // colonneCSV → champOperioz
  const [sep, setSep] = useState<string>(",");
  const [result, setResult] = useState<{ imported: number; errors: number; duplicates: number; errorDetails: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const importClients = trpc.importErp.importClients.useMutation();
  const importDevis = trpc.importErp.importDevis.useMutation();
  const importFactures = trpc.importErp.importFactures.useMutation();
  const isImporting = importClients.isPending || importDevis.isPending || importFactures.isPending;

  const fields = KIND_META[kind].fields;

  const handleFile = async (file: File) => {
    try {
      // Lit en UTF-8 par defaut, fallback ISO-8859-1 si ratio de remplacement eleve.
      let text = await file.text();
      if ((text.match(/�/g) || []).length > 5) {
        // Re-decode en latin1
        const buf = await file.arrayBuffer();
        text = new TextDecoder("iso-8859-1").decode(buf);
      }
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setSep(parsed.sep);
      // Mapping auto : si une colonne CSV s'appelle exactement comme un champ Operioz, on pre-remplit.
      const auto: Record<string, string> = {};
      const fieldKeys = fields.map((f) => f.key);
      for (const h of parsed.headers) {
        const norm = h.toLowerCase().replace(/[^a-z]/g, "");
        const match = fieldKeys.find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === norm);
        if (match) auto[h] = match;
      }
      setMapping(auto);
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message || "Impossible de lire le fichier");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const allRequiredMapped = useMemo(() => {
    const required = fields.filter((f) => f.required).map((f) => f.key);
    const mapped = new Set(Object.values(mapping));
    return required.every((r) => mapped.has(r));
  }, [fields, mapping]);

  const launchImport = async () => {
    try {
      let res;
      if (kind === "clients") res = await importClients.mutateAsync({ rows, mapping });
      else if (kind === "devis") res = await importDevis.mutateAsync({ rows, mapping });
      else res = await importFactures.mutateAsync({ rows, mapping });
      setResult(res);
      setStep(4);
      // Invalide les caches concernes pour rafraichir les pages.
      if (kind === "clients") utils.clients.list.invalidate();
      if (kind === "devis") utils.devis.list.invalidate();
      if (kind === "factures") utils.factures.list.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'import");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Importer des données</h1>
        <p className="text-muted-foreground mt-1">
          Récupérez vos clients, devis et factures depuis un autre logiciel en 3 étapes.
        </p>
      </header>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={`h-7 w-7 inline-flex items-center justify-center rounded-full font-semibold ${
              step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {n}
            </span>
            {n < 4 && <span className={`h-0.5 w-8 ${step > n ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ───── ÉTAPE 1 — Source ───── */}
        {step === 1 && (
          <motion.section
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h2 className="text-lg font-semibold mb-4">1. D'où viennent vos données ?</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSource(s);
                    setStep(2);
                  }}
                  className={`text-left rounded-xl border p-4 transition-all hover:shadow-md hover:scale-[1.02] ${s.bg}`}
                >
                  <p className="font-semibold text-sm">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.templates.map((t) => (
                      <a
                        key={t.kind}
                        href={t.href}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[10px] font-medium bg-white/70 dark:bg-black/20 hover:bg-white px-2 py-1 rounded"
                      >
                        <Download className="h-3 w-3" />
                        Template {KIND_META[t.kind].label}
                      </a>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* ───── ÉTAPE 2 — Upload ───── */}
        {step === 2 && (
          <motion.section
            key="step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">2. Upload du fichier ({source?.label})</h2>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Changer
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {(["clients", "devis", "factures"] as ImportKind[]).map((k) => {
                const Icon = KIND_META[k].icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      kind === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {KIND_META[k].label}
                  </button>
                );
              })}
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="rounded-xl border-2 border-dashed border-border p-10 text-center hover:bg-accent/30 transition-colors"
            >
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Glissez-déposez votre fichier ici</p>
              <p className="text-xs text-muted-foreground mb-4">CSV, séparateur auto-détecté (virgule, point-virgule, tab)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Parcourir
              </Button>
            </div>
          </motion.section>
        )}

        {/* ───── ÉTAPE 3 — Mapping ───── */}
        {step === 3 && (
          <motion.section
            key="step3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                3. Mapping des colonnes ({rows.length} lignes, séparateur "{sep === "\t" ? "TAB" : sep}")
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Re-uploader
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-semibold">Colonne CSV</th>
                    <th className="text-left p-2 font-semibold">Aperçu</th>
                    <th className="text-left p-2 font-semibold">→ Champ Operioz</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h} className="border-t border-border">
                      <td className="p-2 font-medium">{h}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                        {rows.slice(0, 3).map((r) => r[h]).filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="p-2">
                        <select
                          value={mapping[h] || ""}
                          onChange={(e) =>
                            setMapping((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[h] = e.target.value;
                              else delete next[h];
                              return next;
                            })
                          }
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        >
                          <option value="">— ignorer —</option>
                          {fields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!allRequiredMapped && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                Mappez au moins les champs marqués d'un *.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Annuler
              </Button>
              <Button onClick={launchImport} disabled={!allRequiredMapped || isImporting}>
                {isImporting ? "Import…" : <>Lancer l'import <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </div>
          </motion.section>
        )}

        {/* ───── ÉTAPE 4 — Résultat ───── */}
        {step === 4 && result && (
          <motion.section
            key="step4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="rounded-2xl border border-border p-6 bg-card">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Import terminé
              </h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{result.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">importés</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                  <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{result.duplicates}</p>
                  <p className="text-xs text-muted-foreground mt-1">doublons ignorés</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-4 text-center">
                  <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{result.errors}</p>
                  <p className="text-xs text-muted-foreground mt-1">erreurs</p>
                </div>
              </div>

              {result.errorDetails.length > 0 && (
                <details className="mb-4">
                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                    Voir le détail des erreurs ({result.errorDetails.length})
                  </summary>
                  <div className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-3">
                    {result.errorDetails.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mb-1">
                        <XCircle className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />
                        {e}
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => { setStep(1); setResult(null); }}>
                  Importer autre chose
                </Button>
                <Button
                  onClick={() => {
                    if (kind === "clients") setLocation("/clients");
                    else if (kind === "devis") setLocation("/devis");
                    else setLocation("/factures");
                  }}
                >
                  Voir mes {KIND_META[kind].label.toLowerCase()} →
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
