import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Database, Download, FileSpreadsheet,
  FileText, HelpCircle, Lock, RefreshCw, Receipt, Save, Shield, Sparkles, Trash2,
  Upload, Users as UsersIcon, Wand2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// SOURCES disponibles + templates
// ============================================================================

interface SourceErp {
  key: string;
  label: string;
  shortName: string;
  description: string;
  templates: { kind: ImportKind; href: string }[];
  /** Couleur de marque (gradient). */
  gradient: string;
  /** Initiales pour le logo monogramme. */
  initials: string;
  /** Mis en avant ? */
  recommended?: boolean;
}

const SOURCES: SourceErp[] = [
  {
    key: "ebp",
    label: "EBP Bâtiment",
    shortName: "EBP",
    description: "Logiciel de gestion EBP Bâtiment / Devis-Factures. Les exports clients EBP sont supportés en CSV séparé par point-virgule.",
    gradient: "from-blue-700 to-blue-900",
    initials: "E",
    templates: [{ kind: "clients", href: "/templates/template-ebp-clients.csv" }],
  },
  {
    key: "sage",
    label: "Sage 50 / 100",
    shortName: "Sage",
    description: "Sage 50 Compta, Sage 100 Gestion Commerciale. Format CSV avec guillemets.",
    gradient: "from-emerald-600 to-green-800",
    initials: "S",
    templates: [{ kind: "clients", href: "/templates/template-sage-clients.csv" }],
  },
  {
    key: "ciel",
    label: "Ciel Devis Factures",
    shortName: "Ciel",
    description: "Ciel Compta / Devis-Factures. Export CSV standard.",
    gradient: "from-sky-500 to-blue-600",
    initials: "C",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "pennylane",
    label: "Pennylane",
    shortName: "Pennylane",
    description: "Logiciel de comptabilité Pennylane. Export clients/factures en CSV.",
    gradient: "from-violet-600 to-purple-700",
    initials: "P",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "batappli",
    label: "Batappli",
    shortName: "Batappli",
    description: "Logiciel de gestion bâtiment Batappli.",
    gradient: "from-orange-500 to-amber-600",
    initials: "B",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "obat",
    label: "Obat",
    shortName: "Obat",
    description: "Logiciel de devis-factures pour le BTP.",
    gradient: "from-red-600 to-rose-700",
    initials: "O",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "tolteck",
    label: "Tolteck",
    shortName: "Tolteck",
    description: "Logiciel de devis pour artisans.",
    gradient: "from-teal-500 to-cyan-700",
    initials: "T",
    templates: [{ kind: "clients", href: "/templates/template-universel-clients.csv" }],
  },
  {
    key: "csv",
    label: "Fichier CSV universel",
    shortName: "CSV",
    description: "Tout fichier CSV ou Excel exporté manuellement. Toujours disponible et le plus flexible.",
    gradient: "from-slate-500 to-slate-700",
    initials: "★",
    recommended: true,
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
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    return obj;
  });
  return { headers, rows, sep };
}

function bytesToHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// ============================================================================
// Stepper visuel
// ============================================================================

const STEPS: { num: number; label: string }[] = [
  { num: 1, label: "Source" },
  { num: 2, label: "Fichier" },
  { num: 3, label: "Mapping" },
  { num: 4, label: "Import" },
];

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-between gap-2 max-w-2xl mx-auto">
      {STEPS.map((s, idx) => {
        const isDone = current > s.num;
        const isActive = current === s.num;
        return (
          <div key={s.num} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={`flex-1 h-0.5 ${current > s.num ? "bg-emerald-500" : current === s.num ? "bg-blue-500" : "bg-muted"}`} />
              )}
              <div className={`relative h-9 w-9 rounded-full inline-flex items-center justify-center text-sm font-bold transition-all ${
                isDone
                  ? "bg-emerald-500 text-white"
                  : isActive
                  ? "bg-blue-600 text-white ring-4 ring-blue-500/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}>
                {isDone ? <Check className="h-4 w-4" /> : s.num}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${current > s.num ? "bg-emerald-500" : "bg-muted"}`} />
              )}
            </div>
            <span className={`mt-2 text-[11px] font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
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
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sep, setSep] = useState<string>(",");
  const [result, setResult] = useState<{ imported: number; errors: number; duplicates: number; errorDetails: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const importClients = trpc.importErp.importClients.useMutation();
  const importDevis = trpc.importErp.importDevis.useMutation();
  const importFactures = trpc.importErp.importFactures.useMutation();
  const isImporting = importClients.isPending || importDevis.isPending || importFactures.isPending;

  const fields = KIND_META[kind].fields;

  const autoMap = (csvHeaders: string[]) => {
    const auto: Record<string, string> = {};
    const fieldKeys = fields.map((f) => f.key);
    for (const h of csvHeaders) {
      const norm = h.toLowerCase().replace(/[^a-z]/g, "");
      const match = fieldKeys.find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === norm);
      if (match) auto[h] = match;
    }
    return auto;
  };

  const handleFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 10 Mo)");
      return;
    }
    try {
      let text = await f.text();
      if ((text.match(/�/g) || []).length > 5) {
        const buf = await f.arrayBuffer();
        text = new TextDecoder("iso-8859-1").decode(buf);
      }
      const parsed = parseCsv(text);
      setFile(f);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setSep(parsed.sep);
      setMapping(autoMap(parsed.headers));
    } catch (e: any) {
      toast.error(e?.message || "Impossible de lire le fichier");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const removeFile = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
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
      if (kind === "clients") utils.clients.list.invalidate();
      if (kind === "devis") utils.devis.list.invalidate();
      if (kind === "factures") utils.factures.list.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'import");
    }
  };

  const downloadErrorReport = () => {
    if (!result) return;
    const txt = result.errorDetails.join("\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-import-${kind}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ───── HEADER vert ───── */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-green-700 to-teal-800 text-white p-6 md:p-8 shadow-lg"
        style={{ minHeight: 160 }}
      >
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-blob" />
          <div className="absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-emerald-300/15 blur-3xl animate-blob animation-delay-2000" />
        </div>
        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Migrez vos données vers Operioz</h1>
          <p className="mt-2 text-emerald-100/90 max-w-2xl">
            Récupérez vos clients, devis et factures depuis votre ancien logiciel en 3 minutes.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: Shield, label: "Données sécurisées" },
              { icon: RefreshCw, label: "Import sans perte" },
              { icon: HelpCircle, label: "Assistance incluse" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1 text-xs font-medium">
                <Check className="h-3.5 w-3.5 text-emerald-200" />
                <Icon className="h-3 w-3" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </motion.header>

      {/* ───── STEPPER ───── */}
      <Stepper current={step} />

      <AnimatePresence mode="wait">
        {/* ───── ÉTAPE 1 — Source ───── */}
        {step === 1 && (
          <motion.section
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-lg font-semibold mb-1">D'où viennent vos données ?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Sélectionnez votre logiciel actuel. Téléchargez le template pour formater votre export correctement.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map((s, i) => {
                const selected = source?.key === s.key;
                return (
                  <motion.button
                    key={s.key}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    whileHover={{ y: -2 }}
                    onClick={() => { setSource(s); setStep(2); }}
                    className={`relative text-left rounded-2xl border-2 p-5 transition-all hover:shadow-xl ${
                      selected ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border bg-card"
                    }`}
                  >
                    {s.recommended && (
                      <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 shadow">
                        <Sparkles className="h-3 w-3" /> Recommandé
                      </span>
                    )}
                    {selected && (
                      <span className="absolute top-3 right-3 h-6 w-6 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shadow">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${s.gradient} text-white inline-flex items-center justify-center text-2xl font-bold shadow-lg mb-3`}>
                      {s.initials}
                    </div>
                    <p className="font-semibold text-base">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[2.4em]">{s.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.templates.map((t) => (
                        <a
                          key={t.kind}
                          href={t.href}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-background border border-border hover:bg-accent px-2 py-1 rounded-md transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          Template {KIND_META[t.kind].label}
                        </a>
                      ))}
                    </div>
                  </motion.button>
                );
              })}
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
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Upload du fichier</h2>
                <p className="text-sm text-muted-foreground">Source : <span className="font-medium text-foreground">{source?.label}</span></p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Changer
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs font-semibold text-muted-foreground py-1.5">Type de données :</span>
              {(["clients", "devis", "factures"] as ImportKind[]).map((k) => {
                const Icon = KIND_META[k].icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      kind === k
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-transparent border-border hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {KIND_META[k].label}
                  </button>
                );
              })}
            </div>

            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="rounded-2xl border-2 border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent p-10 text-center hover:bg-accent/20 transition-colors"
                style={{ minHeight: 300 }}
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl mx-auto mb-5"
                >
                  <Upload className="h-10 w-10" />
                </motion.div>
                <p className="text-lg font-semibold mb-1">Glissez votre fichier ici</p>
                <p className="text-sm text-muted-foreground mb-1">ou cliquez pour parcourir</p>
                <p className="text-xs text-muted-foreground mb-5">Formats acceptés : CSV — Taille max : 10 Mo</p>
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
                <Button onClick={() => fileInputRef.current?.click()} size="lg">
                  <Upload className="h-4 w-4 mr-2" /> Parcourir
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 inline-flex items-center justify-center">
                    <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bytesToHuman(file.size)} · {rows.length} ligne{rows.length > 1 ? "s" : ""} · séparateur "{sep === "\t" ? "TAB" : sep}"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    aria-label="Supprimer le fichier"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {rows.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Aperçu des 5 premières lignes</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {headers.slice(0, 6).map((h) => (
                              <th key={h} className="text-left p-2 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                            {headers.length > 6 && <th className="p-2 text-muted-foreground">+ {headers.length - 6}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t border-border">
                              {headers.slice(0, 6).map((h) => (
                                <td key={h} className="p-2 truncate max-w-[140px]">{r[h] || "—"}</td>
                              ))}
                              {headers.length > 6 && <td className="p-2 text-muted-foreground">…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={removeFile}>Choisir un autre fichier</Button>
                  <Button onClick={() => setStep(3)}>
                    Continuer <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* ───── ÉTAPE 3 — Mapping ───── */}
        {step === 3 && (
          <motion.section
            key="step3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">Mapping des colonnes</h2>
                <p className="text-sm text-muted-foreground">
                  {rows.length} lignes à importer · {Object.keys(mapping).length} colonnes mappées sur {headers.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMapping(autoMap(headers))}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Mapping automatique
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Re-uploader
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-0 bg-muted text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <div className="p-3">Colonne du fichier</div>
                <div className="p-3 text-center"> </div>
                <div className="p-3">Champ Operioz</div>
              </div>
              {headers.map((h) => {
                const mapped = mapping[h];
                const mappedField = fields.find((f) => f.key === mapped);
                const isRequiredMissing = !mapped && false; // pas required par colonne
                return (
                  <div
                    key={h}
                    className={`grid grid-cols-[1fr_auto_1fr] gap-0 items-center border-t border-border transition-colors ${
                      mapped
                        ? "bg-emerald-50/50 dark:bg-emerald-950/10"
                        : isRequiredMissing
                        ? "bg-amber-50/50 dark:bg-amber-950/10"
                        : ""
                    }`}
                  >
                    <div className="p-3">
                      <p className="text-sm font-medium truncate">{h}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {rows.slice(0, 2).map((r) => r[h]).filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="px-2 text-muted-foreground">
                      {mapped ? <ArrowRight className="h-4 w-4 text-emerald-500" /> : <ArrowRight className="h-4 w-4 opacity-30" />}
                    </div>
                    <div className="p-3">
                      <select
                        value={mapped || ""}
                        onChange={(e) =>
                          setMapping((prev) => {
                            const next = { ...prev };
                            if (e.target.value) next[h] = e.target.value;
                            else delete next[h];
                            return next;
                          })
                        }
                        className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm ${
                          mapped ? "border-emerald-300 dark:border-emerald-700" : "border-border"
                        }`}
                      >
                        <option value="">— ignorer cette colonne —</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}{f.required ? " (obligatoire)" : ""}
                          </option>
                        ))}
                      </select>
                      {mappedField?.required && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                          Champ obligatoire validé
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!allRequiredMapped && (
              <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
                <strong>Action requise :</strong> mappez au moins les champs marqués (obligatoire) pour pouvoir lancer l'import.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Annuler</Button>
              <Button onClick={launchImport} disabled={!allRequiredMapped || isImporting} size="lg">
                {isImporting ? "Import en cours…" : (
                  <>Lancer l'import de {rows.length} {KIND_META[kind].label.toLowerCase()} <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
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
            transition={{ duration: 0.4 }}
          >
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-md relative overflow-hidden">
              {result.imported > 0 && result.errors === 0 && (
                <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl"
                  />
                </div>
              )}
              <div className="relative text-center mb-6">
                <motion.div
                  initial={{ scale: 0.7, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 250, damping: 14 }}
                  className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg mb-3"
                >
                  <CheckCircle2 className="h-8 w-8" />
                </motion.div>
                <h2 className="text-2xl font-bold tracking-tight">Import terminé !</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Voici le résumé de l'opération sur vos {KIND_META[kind].label.toLowerCase()}.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center border border-emerald-200 dark:border-emerald-900"
                >
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{result.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">✅ importés</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-4 text-center border border-amber-200 dark:border-amber-900"
                >
                  <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{result.duplicates}</p>
                  <p className="text-xs text-muted-foreground mt-1">⚠️ doublons ignorés</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-4 text-center border border-rose-200 dark:border-rose-900"
                >
                  <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{result.errors}</p>
                  <p className="text-xs text-muted-foreground mt-1">❌ erreurs</p>
                </motion.div>
              </div>

              {result.errorDetails.length > 0 && (
                <details className="mb-6 rounded-lg border border-border p-3">
                  <summary className="text-sm cursor-pointer font-medium hover:text-foreground">
                    Voir le détail des erreurs ({result.errorDetails.length})
                  </summary>
                  <div className="mt-3 max-h-48 overflow-auto rounded bg-muted/40 p-3">
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
                {result.errorDetails.length > 0 && (
                  <Button variant="outline" onClick={downloadErrorReport}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Télécharger le rapport
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setStep(1); setResult(null); setFile(null); setHeaders([]); setRows([]); setMapping({}); }}>
                  Importer autre chose
                </Button>
                <Button
                  size="lg"
                  onClick={() => {
                    if (kind === "clients") setLocation("/clients");
                    else if (kind === "devis") setLocation("/devis");
                    else setLocation("/factures");
                  }}
                >
                  Voir mes données importées <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ───── Section rassurante ───── */}
      <section className="rounded-2xl bg-muted/40 border border-border p-5 mt-8">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-600" />
          Vos données sont en sécurité
        </p>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Chiffrement</strong> : vos fichiers sont traités en HTTPS et stockés chiffrés.</span>
          </div>
          <div className="flex items-start gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Réversible</strong> : vous pouvez supprimer toute donnée importée individuellement.</span>
          </div>
          <div className="flex items-start gap-2">
            <Save className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Sauvegarde automatique</strong> : vos données sont sauvegardées quotidiennement.</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <Database className="h-3 w-3" />
          En cas de problème, contactez notre support à <span className="font-medium">support@operioz.fr</span>.
        </p>
      </section>
    </div>
  );
}
