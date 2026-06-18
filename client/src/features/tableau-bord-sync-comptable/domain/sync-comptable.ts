import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN du `tableau-bord-sync-comptable`. NB : `getSyncLogs` ET `getExports` renvoient le MÊME
// type (`ExportComptableRow`, sans champ `type`) → le `type` lu par le legacy était toujours `undefined`
// (masqué par `any`). On distingue logs/exports par `sourceType` ajouté à la fusion. Agrégats purs testables.

export type SyncRow = RouterOutputs["integrationsComptables"]["getExports"][number];
export type SyncStatus = RouterOutputs["integrationsComptables"]["getSyncStatus"];
export type PendingItems = RouterOutputs["integrationsComptables"]["getPendingItems"];
export type RecentItem = SyncRow & { sourceType: "sync" | "export" };

export type Periode = "7j" | "30j" | "90j" | "365j";
export type StatutFiltre = "tous" | "termine" | "succes" | "erreur" | "en_cours" | "en_attente";
export type TypeFiltre = "tous" | "facture" | "paiement" | "export";

export type SyncFilters = { periode: Periode; statut: StatutFiltre; type: TypeFiltre };

export type SyncStats = {
  totalSyncs: number; syncsReussies: number; syncsErreur: number; tauxReussite: number;
  totalEcritures: number; evolution: number; logsRecents: RecentItem[];
};

const jour = 24 * 60 * 60 * 1000;
function periodeJours(p: Periode): number { return parseInt(p); }

// Un statut correspond-il au filtre (« termine » et « succes » sont regroupés). PUR.
function matchStatut(statut: string | null, filtre: StatutFiltre): boolean {
  if (filtre === "tous") return true;
  if (filtre === "termine" || filtre === "succes") return statut === "termine" || statut === "succes";
  return statut === filtre;
}

// Logs/exports conservés après filtre (période + statut + type). PUR.
function filtrer(rows: readonly SyncRow[], isExport: boolean, dateDebut: Date, f: SyncFilters): SyncRow[] {
  // Filtre type : `export` ne garde que les exports ; `facture`/`paiement` ne gardent rien (pas de champ
  // type dans le DTO new-stack) ; `tous` garde tout.
  if (f.type === "export" && !isExport) return [];
  if ((f.type === "facture" || f.type === "paiement")) return [];
  return rows.filter((r) => new Date(r.createdAt) >= dateDebut && matchStatut(r.statut, f.statut));
}

// Statistiques agrégées (filtrées) + évolution vs période précédente + 10 dernières opérations. PUR.
export function computeStats(syncLogs: readonly SyncRow[], exports: readonly SyncRow[], f: SyncFilters, now: Date = new Date()): SyncStats {
  const dateDebut = new Date(now.getTime() - periodeJours(f.periode) * jour);
  const logs = filtrer(syncLogs, false, dateDebut, f);
  const exps = filtrer(exports, true, dateDebut, f);

  const estReussi = (s: string | null) => s === "termine" || s === "succes";
  const syncsReussies = logs.filter((l) => estReussi(l.statut)).length + exps.filter((e) => e.statut === "termine").length;
  const syncsErreur = logs.filter((l) => l.statut === "erreur").length + exps.filter((e) => e.statut === "erreur").length;
  const totalSyncs = logs.length + exps.length;
  const tauxReussite = totalSyncs > 0 ? (syncsReussies / totalSyncs) * 100 : 100;
  const totalEcritures = exps.reduce((s, e) => s + (e.nombreEcritures || 0), 0);

  // Évolution vs période précédente (sans filtres statut/type, période translatée).
  const datePrecedente = new Date(dateDebut.getTime() - periodeJours(f.periode) * jour);
  const dansPeriodePrec = (r: SyncRow) => new Date(r.createdAt) >= datePrecedente && new Date(r.createdAt) < dateDebut;
  const totalPrecedent = syncLogs.filter(dansPeriodePrec).length + exports.filter(dansPeriodePrec).length;
  const evolution = totalPrecedent > 0 ? ((totalSyncs - totalPrecedent) / totalPrecedent) * 100 : 0;

  const logsRecents: RecentItem[] = [
    ...logs.map((l) => ({ ...l, sourceType: "sync" as const })),
    ...exps.map((e) => ({ ...e, sourceType: "export" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  return { totalSyncs, syncsReussies, syncsErreur, tauxReussite, totalEcritures, evolution, logsRecents };
}

export type ChartPoint = { date: string; syncs: number; label: string };

// Série jour par jour (comptage des synchros filtrées) sur la période. PUR.
export function computeChartData(syncLogs: readonly SyncRow[], exports: readonly SyncRow[], f: SyncFilters, now: Date = new Date()): ChartPoint[] {
  const nbJours = periodeJours(f.periode);
  const data: ChartPoint[] = [];
  for (let i = nbJours - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * jour);
    const dateStr = date.toISOString().split("T")[0];
    const memeJour = (r: SyncRow) => new Date(r.createdAt).toISOString().split("T")[0] === dateStr && matchStatut(r.statut, f.statut);
    let syncsJour = f.type === "export" || f.type === "facture" || f.type === "paiement" ? 0 : syncLogs.filter(memeJour).length;
    let exportsJour = f.type === "facture" || f.type === "paiement" ? 0 : exports.filter(memeJour).length;
    if (f.type === "export") syncsJour = 0;
    data.push({ date: dateStr, syncs: syncsJour + exportsJour, label: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) });
  }
  return data;
}

// Variante shadcn d'un statut (pour la pastille). Libellé via i18n `statut.<statut>`. PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" {
  switch (statut) {
    case "termine": case "succes": return "default";
    case "erreur": return "destructive";
    default: return "secondary"; // en_cours / en_attente
  }
}

// Clé i18n du badge de type selon la source. PUR.
export function typeLabelKey(sourceType: string | undefined): string {
  return sourceType === "export" ? "typeExport" : "typeSync";
}
