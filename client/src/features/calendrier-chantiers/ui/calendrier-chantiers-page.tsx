import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { matchSearch } from "@/shared/lib/normalize";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Users, MapPin, Clock, Building2, Download, Eye, Palette, GripVertical, Move, Printer, FileDown, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { useCalendrierChantiers } from "../application/use-calendrier-chantiers";
import { COLORS, JOURS, MOIS, filterInterventions, interventionColor, interventionsForDay, daysInMonth, daysInWeek, rescheduledDate, statutVariant, conflictCounts, buildCsv, type CalendarIntervention, type ViewMode, type ColorMode } from "../domain/calendrier-chantiers";

type Pending = { type: "date" | "technicien"; interventionId: number; interventionTitre: string; newDate?: Date; newTechnicienId?: number; newTechnicienNom?: string };
const STATUTS = ["planifiee", "en_cours", "terminee", "annulee"] as const;
const STATUT_KEY: Record<string, string> = { planifiee: "statutPlanifiee", en_cours: "statutEnCours", terminee: "statutTerminee", annulee: "statutAnnulee" };
const colorClassToName = (cls: string) => ["blue", "green", "purple", "orange", "pink", "teal", "indigo", "red", "yellow"].find((n) => cls.includes(n)) || "gray";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

// Page `calendrier-chantiers` — migration clean-archi de `pages/CalendrierChantiers.tsx`. Markup à
// l'identique. Calendrier/transform/couleurs en domain (purs, testés) ; tRPC via `use-calendrier-chantiers`.
export default function CalendrierChantiersPage() {
  const { t } = useTranslation("calendrierChantiers");
  const { chantiers, techniciens, interventions, savedColors, setCouleur, update, assigner } = useCalendrierChantiers();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedChantierId, setSelectedChantierId] = useState<number | null>(null);
  const [selectedTechnicienId, setSelectedTechnicienId] = useState<number | null>(null);
  const [selectedIntervention, setSelectedIntervention] = useState<CalendarIntervention | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [draggedIntervention, setDraggedIntervention] = useState<CalendarIntervention | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [customColors, setCustomColors] = useState<Record<number, string>>({});
  const [colorMode, setColorMode] = useState<ColorMode>("chantier");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChange, setPendingChange] = useState<Pending | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [skipConfirmation, setSkipConfirmation] = useState(false);
  const [pdfSearchTerm, setPdfSearchTerm] = useState("");
  const [pdfFilterChantier, setPdfFilterChantier] = useState<number | null>(null);
  const [pdfFilterTechnicien, setPdfFilterTechnicien] = useState<number | null>(null);
  const [pdfFilterStatut, setPdfFilterStatut] = useState<string | null>(null);
  const [animatingIntervention, setAnimatingIntervention] = useState<number | null>(null);

  useEffect(() => { if (savedColors) setCustomColors(savedColors as Record<number, string>); }, [savedColors]);

  const filtered = useMemo(() => filterInterventions(interventions, selectedChantierId, selectedTechnicienId), [interventions, selectedChantierId, selectedTechnicienId]);
  const color = (i: CalendarIntervention) => interventionColor(i, customColors, colorMode);
  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();
  const isDragOver = (date: Date) => dragOverDate !== null && date.toDateString() === dragOverDate.toDateString();
  const formatDate = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const navigate = (dir: -1 | 1) => { const d = new Date(currentDate); if (viewMode === "month") d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + (viewMode === "week" ? 7 : 1) * dir); setCurrentDate(d); };

  // Drag & drop
  const handleDragStart = (e: React.DragEvent, i: CalendarIntervention) => { setDraggedIntervention(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", i.id.toString()); };
  const handleDragOver = (e: React.DragEvent, date: Date) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDate(date); };
  const applyDateChange = (id: number, newDate: Date) => update.mutate({ id, dateDebut: newDate.toISOString() }, { onSuccess: () => { toast.success(t("toastInterventionMaj")); setShowConfirmDialog(false); setPendingChange(null); }, onError: (e) => toast.error(t("errMaj", { msg: e.message })) });
  const applyTechChange = (id: number, technicienId: number) => assigner.mutate({ interventionId: id, technicienId }, {
    onSuccess: (data) => { const { nbInter, nbConge } = conflictCounts(data); if (nbInter > 0 || nbConge > 0) { const p: string[] = []; if (nbInter > 0) p.push(t("conflitInterventions", { n: nbInter })); if (nbConge > 0) p.push(t("conflitConge")); toast.warning(t("toastReassigneConflit", { details: p.join(" + ") })); } else toast.success(t("toastReassigne")); setShowConfirmDialog(false); setPendingChange(null); },
    onError: (e) => toast.error(t("errReassignation", { msg: e.message })),
  });
  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault(); setDragOverDate(null);
    if (!draggedIntervention) return;
    const newDate = rescheduledDate(draggedIntervention.dateDebut, targetDate);
    if (!newDate) { setDraggedIntervention(null); return; }
    if (skipConfirmation) { applyDateChange(draggedIntervention.id, newDate); setDraggedIntervention(null); return; }
    setPendingChange({ type: "date", interventionId: draggedIntervention.id, interventionTitre: draggedIntervention.description || t("intervention") + ` #${draggedIntervention.id}`, newDate });
    setShowConfirmDialog(true); setDraggedIntervention(null);
  };
  const confirmChange = () => {
    if (!pendingChange) return;
    setAnimatingIntervention(pendingChange.interventionId);
    setTimeout(() => {
      if (pendingChange.type === "date" && pendingChange.newDate) applyDateChange(pendingChange.interventionId, pendingChange.newDate);
      else if (pendingChange.type === "technicien" && pendingChange.newTechnicienId !== undefined) applyTechChange(pendingChange.interventionId, pendingChange.newTechnicienId);
      setTimeout(() => setAnimatingIntervention(null), 500);
    }, 100);
  };
  const cancelChange = () => { setShowConfirmDialog(false); setPendingChange(null); };
  const setInterventionColor = (id: number, colorClass: string) => { setCustomColors((p) => ({ ...p, [id]: colorClass })); setCouleur.mutate({ interventionId: id, couleur: colorClass }); toast.success(t("toastCouleur")); };

  const exportCsv = () => {
    const blob = new Blob([buildCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `calendrier-chantiers-${currentDate.toISOString().split("T")[0]}.csv`; link.click();
    toast.success(t("toastExporte"));
  };

  const pdfFiltered = useMemo(() => filtered.filter((i) => {
    if (pdfSearchTerm && !(matchSearch(i.chantierNom, pdfSearchTerm) || matchSearch(i.description, pdfSearchTerm) || matchSearch(i.technicienNom, pdfSearchTerm) || matchSearch(i.adresse, pdfSearchTerm))) return false;
    if (pdfFilterChantier && i.chantierId !== pdfFilterChantier) return false;
    if (pdfFilterTechnicien && i.technicienId !== pdfFilterTechnicien) return false;
    if (pdfFilterStatut && i.statut !== pdfFilterStatut) return false;
    return true;
  }), [filtered, pdfSearchTerm, pdfFilterChantier, pdfFilterTechnicien, pdfFilterStatut]);

  const statutFr = (s: string) => t(STATUT_KEY[s] ?? "statutPlanifiee");
  const periodLabel = viewMode === "month" ? `${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}` : viewMode === "week" ? `Semaine du ${daysInWeek(currentDate)[0].toLocaleDateString("fr-FR")}` : formatDate(currentDate);

  const generatePdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(20); doc.setTextColor(51, 51, 51); doc.text("Calendrier des Chantiers", 148.5, 15, { align: "center" });
    doc.setFontSize(14); doc.setTextColor(102, 102, 102); doc.text(periodLabel, 148.5, 23, { align: "center" });
    autoTable(doc, {
      startY: 30,
      head: [["Chantier", "Description", "Début", "Fin", "Technicien", "Adresse", "Statut"]],
      body: pdfFiltered.map((i) => [i.chantierNom, i.description || "Intervention", new Date(i.dateDebut).toLocaleDateString("fr-FR"), i.dateFin ? new Date(i.dateFin).toLocaleDateString("fr-FR") : "-", i.technicienNom || "Non assigné", i.adresse || "-", statutFr(i.statut)]),
      theme: "striped", headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" }, styles: { fontSize: 9, cellPadding: 3 },
    });
    return doc;
  };
  const previewPDF = () => { setPdfDataUrl(generatePdf().output("datauristring")); setShowPdfPreview(true); };
  const regenPdf = () => setTimeout(() => setPdfDataUrl(generatePdf().output("datauristring")), 200);
  const downloadFromPreview = () => { generatePdf().save(`calendrier-chantiers-${currentDate.toISOString().split("T")[0]}.pdf`); setShowPdfPreview(false); setPdfDataUrl(null); toast.success(t("toastPdf")); };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error(t("errPopups")); return; }
    const grid = daysInMonth(currentDate).map(({ date, isCurrentMonth }) => {
      const dayInt = interventionsForDay(filtered, date);
      const events = dayInt.slice(0, 3).map((i) => `<div class="event ${colorClassToName(color(i))}">${esc(i.chantierNom)}</div>`).join("");
      const more = dayInt.length > 3 ? `<div style="font-size:10px;color:#666;">+${dayInt.length - 3} autres</div>` : "";
      return `<div class="day-cell ${!isCurrentMonth ? "other-month" : ""} ${isToday(date) ? "today" : ""}"><div class="day-number">${date.getDate()}</div>${events}${more}</div>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Calendrier des Chantiers - ${esc(periodLabel)}</title><style>@page{size:landscape;margin:1cm}body{font-family:-apple-system,sans-serif;padding:20px;color:#333}.print-header{text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:10px}.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:#ddd;border:1px solid #ddd}.day-header{background:#f5f5f5;padding:8px;text-align:center;font-weight:bold;font-size:12px}.day-cell{background:white;min-height:80px;padding:4px}.day-number{font-weight:bold;font-size:14px;margin-bottom:4px}.day-cell.other-month{background:#fafafa;color:#999}.day-cell.today{background:#e3f2fd}.event{font-size:10px;padding:2px 4px;margin-bottom:2px;border-radius:2px;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.event.blue{background:#3b82f6}.event.green{background:#22c55e}.event.purple{background:#a855f7}.event.orange{background:#f97316}.event.pink{background:#ec4899}.event.teal{background:#14b8a6}.event.indigo{background:#6366f1}.event.red{background:#ef4444}.event.yellow{background:#eab308;color:#333}.event.gray{background:#6b7280}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="print-header"><h1>Calendrier des Chantiers</h1><p>${esc(periodLabel)}</p></div><div class="calendar-grid">${JOURS.map((j) => `<div class="day-header">${j}</div>`).join("")}${grid}</div><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
    w.document.close();
  };

  const ColorPicker = ({ id, current }: { id: number; current: string }) => (
    <div className="flex flex-wrap gap-2 mt-2">
      {COLORS.map((c) => (<button key={c.class} className={`w-6 h-6 rounded-full ${c.class} hover:ring-2 ring-offset-2 transition-all ${current === c.class ? "ring-2" : ""}`} onClick={() => setInterventionColor(id, c.class)} title={c.name} />))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild><Button variant="outline"><Palette className="h-4 w-4 mr-2" />{t("couleurs")}</Button></PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-4">
                <div>
                  <Label>{t("modeColoration")}</Label>
                  <Select value={colorMode} onValueChange={(v) => setColorMode(v as ColorMode)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chantier">{t("parChantier")}</SelectItem>
                      <SelectItem value="technicien">{t("parTechnicien")}</SelectItem>
                      <SelectItem value="statut">{t("parStatut")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Label className="text-sm text-muted-foreground">{t("personnaliserCouleur")}</Label>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />{t("exporter")}</Button>
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />{t("imprimer")}</Button>
          <Button variant="outline" onClick={previewPDF}><FileDown className="h-4 w-4 mr-2" />{t("pdf")}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedChantierId?.toString() || "all"} onValueChange={(v) => setSelectedChantierId(v === "all" ? null : parseInt(v))}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("tousChantiers")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("tousChantiers")}</SelectItem>
                    {chantiers.map((c) => (<SelectItem key={c.id} value={c.id.toString()}>{c.nom}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={selectedTechnicienId?.toString() || "all"} onValueChange={(v) => setSelectedTechnicienId(v === "all" ? null : parseInt(v))}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("tousTechniciens")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("tousTechniciens")}</SelectItem>
                  {techniciens.map((tech) => (<SelectItem key={tech.id} value={tech.id.toString()}>{tech.prenom} {tech.nom}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>{t("aujourdhui")}</Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold min-w-[200px] text-center">{periodLabel}</span>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant={viewMode === "month" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("month")}>{t("mois")}</Button>
              <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("week")}>{t("semaine")}</Button>
              <Button variant={viewMode === "day" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("day")}>{t("jour")}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {draggedIntervention && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
          <Move className="h-4 w-4 text-blue-600" /><span className="text-sm text-blue-700">{t("deplacerVers", { nom: draggedIntervention.chantierNom })}</span>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {viewMode === "month" && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-2">{JOURS.map((j) => (<div key={j} className="text-center text-sm font-medium text-muted-foreground py-2">{j}</div>))}</div>
              <div className="grid grid-cols-7 gap-1">
                {daysInMonth(currentDate).map(({ date, isCurrentMonth }, index) => {
                  const dayInt = interventionsForDay(filtered, date);
                  return (
                    <div key={index} className={`min-h-[100px] border rounded-lg p-1 transition-colors ${isCurrentMonth ? "bg-background" : "bg-muted/30"} ${isToday(date) ? "ring-2 ring-primary" : ""} ${isDragOver(date) ? "bg-blue-100 border-blue-400" : ""}`} onDragOver={(e) => handleDragOver(e, date)} onDragLeave={() => setDragOverDate(null)} onDrop={(e) => handleDrop(e, date)}>
                      <div className={`text-sm font-medium mb-1 ${isCurrentMonth ? "" : "text-muted-foreground"} ${isToday(date) ? "text-primary" : ""}`}>{date.getDate()}</div>
                      <div className="space-y-1">
                        {dayInt.slice(0, 3).map((i) => (
                          <Popover key={i.id}>
                            <PopoverTrigger asChild>
                              <div draggable onDragStart={(e) => handleDragStart(e, i)} onDragEnd={() => { setDraggedIntervention(null); setDragOverDate(null); }} className={`text-xs p-1 rounded cursor-grab active:cursor-grabbing text-white truncate flex items-center gap-1 ${color(i)} ${draggedIntervention?.id === i.id ? "opacity-50 scale-105" : ""} ${animatingIntervention === i.id ? "animate-pulse ring-2 ring-primary ring-offset-2 scale-110 transition-all duration-300" : "transition-all duration-200"}`} title={`${i.chantierNom} - ${i.description || "Intervention"}`}>
                                <GripVertical className="h-3 w-3 flex-shrink-0" /><span className="truncate">{i.chantierNom}</span>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-64">
                              <div className="space-y-3">
                                <div><h4 className="font-semibold">{i.chantierNom}</h4><p className="text-sm text-muted-foreground">{i.description || t("intervention")}</p></div>
                                <div><Label className="text-sm">{t("changerCouleur")}</Label><ColorPicker id={i.id} current={customColors[i.id] || color(i)} /></div>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => { setSelectedIntervention(i); setIsDetailDialogOpen(true); }}><Eye className="h-4 w-4 mr-2" />{t("voirDetails")}</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ))}
                        {dayInt.length > 3 && (<div className="text-xs text-muted-foreground text-center">{t("autres", { n: dayInt.length - 3 })}</div>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div>
              <div className="grid grid-cols-7 gap-2 mb-4">{daysInWeek(currentDate).map((date, index) => (<div key={index} className={`text-center p-2 rounded-lg ${isToday(date) ? "bg-primary text-primary-foreground" : "bg-muted"}`}><div className="text-sm font-medium">{JOURS[index]}</div><div className="text-lg font-bold">{date.getDate()}</div></div>))}</div>
              <div className="grid grid-cols-7 gap-2">
                {daysInWeek(currentDate).map((date, index) => {
                  const dayInt = interventionsForDay(filtered, date);
                  return (
                    <div key={index} className={`min-h-[300px] border rounded-lg p-2 space-y-2 transition-colors ${isDragOver(date) ? "bg-blue-100 border-blue-400" : ""}`} onDragOver={(e) => handleDragOver(e, date)} onDragLeave={() => setDragOverDate(null)} onDrop={(e) => handleDrop(e, date)}>
                      {dayInt.map((i) => (
                        <Card key={i.id} draggable onDragStart={(e) => handleDragStart(e, i)} onDragEnd={() => { setDraggedIntervention(null); setDragOverDate(null); }} className={`cursor-grab active:cursor-grabbing hover:shadow-md ${draggedIntervention?.id === i.id ? "opacity-50 scale-105" : ""} ${animatingIntervention === i.id ? "animate-pulse ring-2 ring-primary ring-offset-2 scale-105 transition-all duration-300" : "transition-all duration-200"}`} onClick={() => { setSelectedIntervention(i); setIsDetailDialogOpen(true); }}>
                          <CardContent className="p-2">
                            <div className={`w-full h-1 rounded mb-2 ${color(i)}`} />
                            <div className="flex items-start gap-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{i.chantierNom}</p>
                                <p className="text-xs text-muted-foreground truncate">{i.description || t("intervention")}</p>
                                {i.technicienNom && (<div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{i.technicienNom}</div>)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {dayInt.length === 0 && (<div className="text-xs text-muted-foreground text-center py-4">{t("aucuneIntervention")}</div>)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "day" && (
            <div>
              <div className="text-center mb-4"><h2 className="text-xl font-semibold">{formatDate(currentDate)}</h2></div>
              <div className={`space-y-4 min-h-[200px] p-4 rounded-lg transition-colors ${isDragOver(currentDate) ? "bg-blue-100 border-2 border-blue-400 border-dashed" : ""}`} onDragOver={(e) => handleDragOver(e, currentDate)} onDragLeave={() => setDragOverDate(null)} onDrop={(e) => handleDrop(e, currentDate)}>
                {interventionsForDay(filtered, currentDate).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground"><CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>{t("aucuneInterventionJour")}</p><p className="text-sm mt-2">{t("glissezIci")}</p></div>
                ) : (
                  interventionsForDay(filtered, currentDate).map((i) => (
                    <Card key={i.id} draggable onDragStart={(e) => handleDragStart(e, i)} onDragEnd={() => { setDraggedIntervention(null); setDragOverDate(null); }} className={`cursor-grab active:cursor-grabbing hover:shadow-md ${draggedIntervention?.id === i.id ? "opacity-50 scale-105" : ""} ${animatingIntervention === i.id ? "animate-pulse ring-2 ring-primary ring-offset-2 scale-105 transition-all duration-300" : "transition-all duration-200"}`} onClick={() => { setSelectedIntervention(i); setIsDetailDialogOpen(true); }}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-2"><GripVertical className="h-5 w-5 text-muted-foreground" /><div className={`w-2 h-full min-h-[80px] rounded ${color(i)}`} /></div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div><h3 className="font-semibold text-lg">{i.chantierNom}</h3><p className="text-muted-foreground">{i.description || t("intervention")}</p></div>
                              <Badge variant={statutVariant(i.statut)}>{statutFr(i.statut)}</Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                              {i.technicienNom && (<div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-muted-foreground" /><span>{i.technicienNom}</span></div>)}
                              {i.adresse && (<div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="truncate">{i.adresse}</span></div>)}
                              <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span>{new Date(i.dateDebut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{i.dateFin && ` - ${new Date(i.dateFin).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}</span></div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4" />{t("legende", { mode: colorMode === "chantier" ? t("parChantier") : colorMode === "technicien" ? t("parTechnicien") : t("parStatut") })}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {colorMode === "chantier" && chantiers.slice(0, 10).map((c) => (<div key={c.id} className="flex items-center gap-2"><div className={`w-4 h-4 rounded ${COLORS[c.id % COLORS.length].class}`} /><span className="text-sm">{c.nom}</span></div>))}
            {colorMode === "technicien" && techniciens.slice(0, 10).map((tech) => (<div key={tech.id} className="flex items-center gap-2"><div className={`w-4 h-4 rounded ${COLORS[tech.id % COLORS.length].class}`} /><span className="text-sm">{tech.prenom} {tech.nom}</span></div>))}
            {colorMode === "statut" && STATUTS.map((s) => (<div key={s} className="flex items-center gap-2"><div className={`w-4 h-4 rounded ${s === "planifiee" ? "bg-blue-500" : s === "en_cours" ? "bg-yellow-500" : s === "terminee" ? "bg-green-500" : "bg-red-500"}`} /><span className="text-sm">{statutFr(s)}</span></div>))}
          </div>
        </CardContent>
      </Card>

      {/* Détail */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("detailsIntervention")}</DialogTitle></DialogHeader>
          {selectedIntervention && (
            <div className="space-y-4">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-muted-foreground" /><div><p className="font-semibold">{selectedIntervention.chantierNom}</p><p className="text-sm text-muted-foreground">{t("chantier")}</p></div></div>
              {selectedIntervention.description && (<div><Label className="text-muted-foreground">{t("description")}</Label><p>{selectedIntervention.description}</p></div>)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground">{t("dateDebut")}</Label><p>{new Date(selectedIntervention.dateDebut).toLocaleDateString("fr-FR")}</p></div>
                {selectedIntervention.dateFin && (<div><Label className="text-muted-foreground">{t("dateFin")}</Label><p>{new Date(selectedIntervention.dateFin).toLocaleDateString("fr-FR")}</p></div>)}
              </div>
              {selectedIntervention.technicienNom && (<div className="flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="font-medium">{selectedIntervention.technicienNom}</p><p className="text-sm text-muted-foreground">{t("technicienAssigne")}</p></div></div>)}
              {selectedIntervention.adresse && (<div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-muted-foreground" /><div><p>{selectedIntervention.adresse}</p><p className="text-sm text-muted-foreground">{t("adresse")}</p></div></div>)}
              <div><Label className="text-muted-foreground">{t("statut")}</Label><div className="mt-1"><Badge variant={statutVariant(selectedIntervention.statut)}>{statutFr(selectedIntervention.statut)}</Badge></div></div>
              <div><Label className="text-muted-foreground">{t("couleurPersonnalisee")}</Label><ColorPicker id={selectedIntervention.id} current={customColors[selectedIntervention.id] || ""} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>{t("fermer")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Move className="h-5 w-5 text-primary" />{pendingChange?.type === "date" ? t("confirmerDate") : t("confirmerReassignation")}</DialogTitle>
            <DialogDescription className="pt-2">
              {pendingChange?.type === "date" ? (
                <span className="space-y-2 block">
                  <span className="block">{t("voulezVousDeplacer")}</span>
                  <span className="bg-muted p-3 rounded-lg block">
                    <span className="font-medium block">"{pendingChange?.interventionTitre}"</span>
                    <span className="text-sm mt-1 block"><span className="text-muted-foreground">{t("nouvelleDate")}</span>{" "}<strong className="text-primary">{pendingChange?.newDate?.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong></span>
                  </span>
                </span>
              ) : (
                <span className="space-y-2 block">
                  <span className="block">{t("voulezVousReassigner")}</span>
                  <span className="bg-muted p-3 rounded-lg block">
                    <span className="font-medium block">"{pendingChange?.interventionTitre}"</span>
                    <span className="text-sm mt-1 block"><span className="text-muted-foreground">{t("nouveauTechnicien")}</span>{" "}<strong className="text-primary">{pendingChange?.newTechnicienNom}</strong></span>
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <input type="checkbox" id="skipConfirmation" checked={skipConfirmation} onChange={(e) => setSkipConfirmation(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <Label htmlFor="skipConfirmation" className="text-sm text-muted-foreground cursor-pointer">{t("nePlusDemanderSession")}</Label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={cancelChange} className="text-muted-foreground">{t("annulerLaction")}</Button>
            <Button variant="outline" onClick={cancelChange}>{t("nonAnnuler")}</Button>
            <Button onClick={confirmChange} disabled={update.isPending || assigner.isPending}>
              {update.isPending || assigner.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />{t("confirmation")}</> : t("ouiConfirmer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prévisualisation PDF */}
      <Dialog open={showPdfPreview} onOpenChange={(open) => { setShowPdfPreview(open); if (!open) { setPdfSearchTerm(""); setPdfFilterChantier(null); setPdfFilterTechnicien(null); setPdfFilterStatut(null); } }}>
        <DialogContent className="max-w-6xl h-[95vh]">
          <DialogHeader><DialogTitle>{t("previsualisationPdf")}</DialogTitle><DialogDescription>{t("filtrezVerifiez")}</DialogDescription></DialogHeader>
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("rechercher")} value={pdfSearchTerm} onChange={(e) => { setPdfSearchTerm(e.target.value); regenPdf(); }} className="pl-9" />
              </div>
            </div>
            <Select value={pdfFilterChantier?.toString() || "all"} onValueChange={(v) => { setPdfFilterChantier(v === "all" ? null : parseInt(v)); regenPdf(); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("chantierPlaceholder")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("tousChantiers")}</SelectItem>{chantiers.map((c) => (<SelectItem key={c.id} value={c.id.toString()}>{c.nom}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={pdfFilterTechnicien?.toString() || "all"} onValueChange={(v) => { setPdfFilterTechnicien(v === "all" ? null : parseInt(v)); regenPdf(); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("technicienPlaceholder")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("tousTechniciens")}</SelectItem>{techniciens.map((tech) => (<SelectItem key={tech.id} value={tech.id.toString()}>{tech.prenom} {tech.nom}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={pdfFilterStatut || "all"} onValueChange={(v) => { setPdfFilterStatut(v === "all" ? null : v); regenPdf(); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder={t("statutPlaceholder")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("tousStatuts")}</SelectItem>{STATUTS.map((s) => (<SelectItem key={s} value={s}>{statutFr(s)}</SelectItem>))}</SelectContent>
            </Select>
            <Badge variant="secondary" className="ml-auto">{t("nInterventions", { n: pdfFiltered.length })}</Badge>
          </div>
          <div className="flex-1 min-h-0 h-[calc(95vh-280px)]">{pdfDataUrl && (<iframe src={pdfDataUrl} className="w-full h-full border rounded-lg" title={t("previsualisationPdf")} />)}</div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowPdfPreview(false); setPdfDataUrl(null); }}>{t("fermer")}</Button>
            <Button onClick={downloadFromPreview}><FileDown className="h-4 w-4 mr-2" />{t("telechargerN", { n: pdfFiltered.length })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
