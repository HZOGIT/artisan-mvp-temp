import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Database, Download, FileSpreadsheet, FileText, HelpCircle, Lock, RefreshCw, Receipt, Save, Shield, Sparkles, Trash2, Upload, Users as UsersIcon, Wand2, XCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useImport } from "../application/use-import";
import { SOURCES, KIND_FIELDS, parseCsv, autoMap, allRequiredMapped, bytesToHuman, type ImportKind, type SourceErp, type Mapping, type CsvRow, type ImportResult } from "../domain/import";

const KIND_ICON: Record<ImportKind, typeof UsersIcon> = { clients: UsersIcon, devis: FileText, factures: Receipt };
type Step = 1 | 2 | 3 | 4;

function Stepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-start justify-between gap-2 max-w-2xl mx-auto">
      {labels.map((label, idx) => {
        const num = idx + 1;
        const isDone = current > num;
        const isActive = current === num;
        return (
          <div key={num} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {idx > 0 && <div className={`flex-1 h-0.5 ${current > num ? "bg-emerald-500" : current === num ? "bg-blue-500" : "bg-muted"}`} />}
              <div className={`relative h-9 w-9 rounded-full inline-flex items-center justify-center text-sm font-bold transition-all ${isDone ? "bg-emerald-500 text-white" : isActive ? "bg-blue-600 text-white ring-4 ring-blue-500/20" : "bg-muted text-muted-foreground border border-border"}`}>
                {isDone ? <Check className="h-4 w-4" /> : num}
              </div>
              {idx < labels.length - 1 && <div className={`flex-1 h-0.5 ${current > num ? "bg-emerald-500" : "bg-muted"}`} />}
            </div>
            <span className={`mt-2 text-[11px] font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/*
 * Page `import` — migration clean-archi de `pages/Import.tsx`. Markup + framer-motion à l'identique. Parser
 * CSV + auto-mapping + catalogues en domain (purs, testés). tRPC encapsulé dans `use-import`.
 */
export default function ImportPage() {
  const { t } = useTranslation("import");
  const { lancer, isImporting } = useImport();
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<SourceErp | null>(null);
  const [kind, setKind] = useState<ImportKind>("clients");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [sep, setSep] = useState(",");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = KIND_FIELDS[kind].fields;
  const required = useMemo(() => allRequiredMapped(fields, mapping), [fields, mapping]);

  const handleFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) { toast.error(t("errTaille")); return; }
    try {
      let text = await f.text();
      if ((text.match(/�/g) || []).length > 5) text = new TextDecoder("iso-8859-1").decode(await f.arrayBuffer());
      const parsed = parseCsv(text);
      setFile(f); setHeaders(parsed.headers); setRows(parsed.rows); setSep(parsed.sep); setMapping(autoMap(parsed.headers, fields));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errLecture"));
    }
  };

  const removeFile = () => { setFile(null); setHeaders([]); setRows([]); setMapping({}); };

  const launchImport = async () => {
    try {
      const res = await lancer(kind, rows, mapping);
      setResult(res);
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errImport"));
    }
  };

  const downloadErrorReport = () => {
    if (!result) return;
    const blob = new Blob([result.errorDetails.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-import-${kind}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-green-700 to-teal-800 text-white p-6 md:p-8 shadow-lg" style={{ minHeight: 160 }}>
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-blob" />
          <div className="absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-emerald-300/15 blur-3xl animate-blob animation-delay-2000" />
        </div>
        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("heroTitre")}</h1>
          <p className="mt-2 text-emerald-100/90 max-w-2xl">{t("heroSousTitre")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[{ icon: Shield, label: t("badgeSecurise") }, { icon: RefreshCw, label: t("badgeSansPerte") }, { icon: HelpCircle, label: t("badgeAssistance") }].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1 text-xs font-medium">
                <Check className="h-3.5 w-3.5 text-emerald-200" /><Icon className="h-3 w-3" />{label}
              </span>
            ))}
          </div>
        </div>
      </motion.header>

      <Stepper current={step} labels={[t("stepSource"), t("stepFichier"), t("stepMapping"), t("stepImport")]} />

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.section key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            <h2 className="text-lg font-semibold mb-1">{t("step1Titre")}</h2>
            <p className="text-sm text-muted-foreground mb-5">{t("step1Desc")}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map((s, i) => {
                const selected = source?.key === s.key;
                return (
                  <motion.button key={s.key} type="button" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.25 }} whileHover={{ y: -2 }} onClick={() => { setSource(s); setStep(2); }} className={`relative text-left rounded-2xl border-2 p-5 transition-all hover:shadow-xl ${selected ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border bg-card"}`}>
                    {s.recommended && <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 shadow"><Sparkles className="h-3 w-3" /> {t("recommande")}</span>}
                    {selected && <span className="absolute top-3 right-3 h-6 w-6 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shadow"><Check className="h-3.5 w-3.5" /></span>}
                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${s.gradient} text-white inline-flex items-center justify-center text-2xl font-bold shadow-lg mb-3`}>{s.initials}</div>
                    <p className="font-semibold text-base">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[2.4em]">{s.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.templates.map((tpl) => (
                        <a key={tpl.kind} href={tpl.href} download onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-background border border-border hover:bg-accent px-2 py-1 rounded-md transition-colors">
                          <Download className="h-3 w-3" />{t("template", { kind: KIND_FIELDS[tpl.kind].label })}
                        </a>
                      ))}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.section>
        )}

        {step === 2 && (
          <motion.section key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{t("step2Titre")}</h2>
                <p className="text-sm text-muted-foreground">{t("source")} <span className="font-medium text-foreground">{source?.label}</span></p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t("changer")}</Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs font-semibold text-muted-foreground py-1.5">{t("typeDonnees")}</span>
              {(["clients", "devis", "factures"] as ImportKind[]).map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${kind === k ? "bg-blue-600 text-white border-blue-600" : "bg-transparent border-border hover:bg-accent"}`}>
                    <Icon className="h-3.5 w-3.5" />{KIND_FIELDS[k].label}
                  </button>
                );
              })}
            </div>
            {!file ? (
              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }} className="rounded-2xl border-2 border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent p-10 text-center hover:bg-accent/20 transition-colors" style={{ minHeight: 300 }}>
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl mx-auto mb-5"><Upload className="h-10 w-10" /></motion.div>
                <p className="text-lg font-semibold mb-1">{t("glisserFichier")}</p>
                <p className="text-sm text-muted-foreground mb-1">{t("ouCliquer")}</p>
                <p className="text-xs text-muted-foreground mb-5">{t("formatsAcceptes")}</p>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <Button onClick={() => fileInputRef.current?.click()} size="lg"><Upload className="h-4 w-4 mr-2" /> {t("parcourir")}</Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 inline-flex items-center justify-center"><FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{t("lignesInfo", { taille: bytesToHuman(file.size), n: rows.length, sep: sep === "\t" ? "TAB" : sep })}</p>
                  </div>
                  <button type="button" onClick={removeFile} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors" aria-label={t("autreFichier")}><Trash2 className="h-4 w-4" /></button>
                </div>
                {rows.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{t("apercu")}</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted"><tr>
                          {headers.slice(0, 6).map((h) => (<th key={h} className="text-left p-2 font-semibold whitespace-nowrap">{h}</th>))}
                          {headers.length > 6 && <th className="p-2 text-muted-foreground">+ {headers.length - 6}</th>}
                        </tr></thead>
                        <tbody>
                          {rows.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t border-border">
                              {headers.slice(0, 6).map((h) => (<td key={h} className="p-2 truncate max-w-[140px]">{r[h] || "—"}</td>))}
                              {headers.length > 6 && <td className="p-2 text-muted-foreground">…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={removeFile}>{t("autreFichier")}</Button>
                  <Button onClick={() => setStep(3)}>{t("continuer")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
                </div>
              </div>
            )}
          </motion.section>
        )}

        {step === 3 && (
          <motion.section key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">{t("step3Titre")}</h2>
                <p className="text-sm text-muted-foreground">{t("step3Info", { lignes: rows.length, mappees: Object.keys(mapping).length, total: headers.length })}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setMapping(autoMap(headers, fields))}><Wand2 className="h-3.5 w-3.5 mr-1.5" />{t("mappingAuto")}</Button>
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t("reUploader")}</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-0 bg-muted text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <div className="p-3">{t("colonneFichier")}</div><div className="p-3 text-center"> </div><div className="p-3">{t("champOperioz")}</div>
              </div>
              {headers.map((h) => {
                const mapped = mapping[h];
                const mappedField = fields.find((f) => f.key === mapped);
                return (
                  <div key={h} className={`grid grid-cols-[1fr_auto_1fr] gap-0 items-center border-t border-border transition-colors ${mapped ? "bg-emerald-50/50 dark:bg-emerald-950/10" : ""}`}>
                    <div className="p-3">
                      <p className="text-sm font-medium truncate">{h}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{rows.slice(0, 2).map((r) => r[h]).filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="px-2 text-muted-foreground"><ArrowRight className={`h-4 w-4 ${mapped ? "text-emerald-500" : "opacity-30"}`} /></div>
                    <div className="p-3">
                      <select value={mapped || ""} onChange={(e) => setMapping((prev) => { const next = { ...prev }; if (e.target.value) next[h] = e.target.value; else delete next[h]; return next; })} className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm ${mapped ? "border-emerald-300 dark:border-emerald-700" : "border-border"}`}>
                        <option value="">{t("ignorerColonne")}</option>
                        {fields.map((f) => (<option key={f.key} value={f.key}>{f.label}{f.required ? t("obligatoireSuffixe") : ""}</option>))}
                      </select>
                      {mappedField?.required && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{t("champObligatoireValide")}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {!required && (
              <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
                <strong>{t("actionRequise")}</strong>{t("actionRequiseDesc")}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>{t("annuler")}</Button>
              <Button onClick={launchImport} disabled={!required || isImporting} size="lg">
                {isImporting ? t("importEnCours") : (<>{t("lancerImport", { n: rows.length, kind: KIND_FIELDS[kind].label.toLowerCase() })} <ArrowRight className="h-4 w-4 ml-2" /></>)}
              </Button>
            </div>
          </motion.section>
        )}

        {step === 4 && result && (
          <motion.section key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-md relative overflow-hidden">
              {result.imported > 0 && result.errors === 0 && (
                <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />
                </div>
              )}
              <div className="relative text-center mb-6">
                <motion.div initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 250, damping: 14 }} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg mb-3"><CheckCircle2 className="h-8 w-8" /></motion.div>
                <h2 className="text-2xl font-bold tracking-tight">{t("importTermine")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("resumeOperation", { kind: KIND_FIELDS[kind].label.toLowerCase() })}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center border border-emerald-200 dark:border-emerald-900"><p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{result.imported}</p><p className="text-xs text-muted-foreground mt-1">{t("importes")}</p></motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-4 text-center border border-amber-200 dark:border-amber-900"><p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{result.duplicates}</p><p className="text-xs text-muted-foreground mt-1">{t("doublonsIgnores")}</p></motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-4 text-center border border-rose-200 dark:border-rose-900"><p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{result.errors}</p><p className="text-xs text-muted-foreground mt-1">{t("erreursLabel")}</p></motion.div>
              </div>
              {result.errorDetails.length > 0 && (
                <details className="mb-6 rounded-lg border border-border p-3">
                  <summary className="text-sm cursor-pointer font-medium hover:text-foreground">{t("voirDetailErreurs", { n: result.errorDetails.length })}</summary>
                  <div className="mt-3 max-h-48 overflow-auto rounded bg-muted/40 p-3">
                    {result.errorDetails.map((e, i) => (<p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mb-1"><XCircle className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />{e}</p>))}
                  </div>
                </details>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {result.errorDetails.length > 0 && <Button variant="outline" onClick={downloadErrorReport}><Download className="h-3.5 w-3.5 mr-1.5" /> {t("telechargerRapport")}</Button>}
                <Button variant="outline" onClick={() => { setStep(1); setResult(null); removeFile(); }}>{t("importerAutre")}</Button>
                <Button size="lg" onClick={() => { window.location.href = kind === "clients" ? "/clients" : kind === "devis" ? "/devis" : "/factures"; }}>{t("voirDonnees")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="rounded-2xl bg-muted/40 border border-border p-5 mt-8">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-600" />{t("securiteTitre")}</p>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="flex items-start gap-2"><Lock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><span><strong>{t("securiteChiffrement")}</strong>{t("securiteChiffrementDesc")}</span></div>
          <div className="flex items-start gap-2"><RefreshCw className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><span><strong>{t("securiteReversible")}</strong>{t("securiteReversibleDesc")}</span></div>
          <div className="flex items-start gap-2"><Save className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><span><strong>{t("securiteSauvegarde")}</strong>{t("securiteSauvegardeDesc")}</span></div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1"><Database className="h-3 w-3" />{t("supportContact")}<span className="font-medium">{t("supportEmail")}</span>.</p>
      </section>
    </div>
  );
}
