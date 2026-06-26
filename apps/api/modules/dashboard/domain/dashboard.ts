import { round2 } from "../../../shared/money";

/*
 * Domaine « dashboard » : agrégats de lecture (accueil). Toutes les fonctions sont PURES et prennent
 * `now` en paramètre (déterminisme des tests). Les formes de sortie répliquent EXACTEMENT le legacy
 * (`server/db.ts` get*), quirks compris — voir findings pour les incohérences legacy connues.
 */

/** ── Lignes brutes (projections minimales scopées tenant) ───────────────────────────────────────── */
export interface DashFacture {
  readonly statut: string | null;
  readonly totalHT: string | null;
  readonly totalTTC: string | null;
  readonly typeDocument: string | null;
  readonly dateFacture: Date;
  readonly datePaiement: Date | null;
  readonly createdAt: Date;
  readonly clientId: number;
  readonly numero: string;
  readonly id: number;
}
export interface DashDevis {
  readonly id: number;
  readonly numero: string;
  readonly statut: string | null;
  readonly createdAt: Date;
}
export interface DashClient {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly createdAt: Date;
}
export interface DashIntervention {
  readonly id: number;
  readonly titre: string;
  readonly statut: string | null;
  readonly dateDebut: Date;
  readonly clientId: number;
  readonly createdAt: Date;
}

/** ── Sorties ────────────────────────────────────────────────────────────────────────────────────── */
export interface DashboardStats {
  readonly caMonth: number;
  readonly caYear: number;
  readonly devisEnCours: number;
  readonly facturesImpayees: { count: number; total: number };
  readonly totalClients: number;
  readonly interventionsAVenir: number;
  readonly totalDevis: number;
  readonly totalFactures: number;
  readonly totalInterventions: number;
  /** Alias de compat (legacy) : chiffreAffaires = caYear, devisEnAttente = devisEnCours. */
  readonly chiffreAffaires: number;
  readonly devisEnAttente: number;
}
export interface RecentActivityItem {
  readonly type: "devis" | "facture" | "intervention" | "client";
  readonly titre: string;
  readonly date: Date;
  readonly id: number;
}
export interface MonthlyCAPoint {
  readonly month: string;
  readonly ca: number;
  readonly count: number;
}
export interface YearlyComparison {
  readonly thisYear: number;
  readonly lastYear: number;
}
export interface TopClient {
  readonly client: DashClient;
  readonly totalCA: number;
  readonly facturesCount: number;
}
export interface ClientEvolutionPoint {
  readonly month: string;
  readonly count: number;
}
export interface Objectifs {
  readonly objectifCA: number;
  readonly currentCA: number;
  readonly objectifDevis: number;
  readonly currentDevis: number;
  readonly objectifClients: number;
  readonly currentClients: number;
}
/** getUpcomingInterventions (proc) : interventions à venir + client joint (forme legacy `{...intervention, client}`). */
export interface UpcomingInterventionItem {
  readonly id: number;
  readonly titre: string;
  readonly dateDebut: Date;
  readonly statut: string | null;
  readonly adresse: string | null;
  readonly clientId: number;
  readonly client: { id: number; nom: string; prenom: string | null } | null;
}
export interface DashAlert {
  readonly type: "danger" | "warning" | "info";
  readonly titre: string;
  readonly message: string;
  readonly lien?: string;
}

const num = (v: unknown): number => parseFloat(String(v ?? "0")) || 0;
const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const FACTURE_PAYEE = "payee";
/** Ligne comptable dans le CA réalisé : facture payée OU avoir validé (montants HT négatifs → déduction auto). */
const isCALine = (f: DashFacture): boolean => f.statut === FACTURE_PAYEE || (f.typeDocument === "avoir" && f.statut === "validee");

/*
 * getDashboardStats (parité : agrégations SQL legacy répliquées en mémoire). caMonth/caYear utilisent
 * COALESCE(datePaiement, createdAt) ; facturesImpayees = statut NOT IN (payee, annulee, brouillon).
 */
export function computeStats(factures: readonly DashFacture[], devis: readonly DashDevis[], totalClients: number, interventions: readonly DashIntervention[], now: Date): DashboardStats {
  const m = now.getMonth();
  const y = now.getFullYear();
  let caMonth = 0;
  let caYear = 0;
  let impayeesCount = 0;
  let impayeesTotal = 0;
  for (const f of factures) {
    if (isCALine(f)) {
      const ref = f.datePaiement ?? f.createdAt;
      const rd = new Date(ref);
      if (rd.getFullYear() === y) {
        caYear += num(f.totalHT);
        if (rd.getMonth() === m) caMonth += num(f.totalHT);
      }
    }
    if (f.statut !== "payee" && f.statut !== "annulee" && f.statut !== "brouillon" && f.typeDocument !== "avoir") {
      impayeesCount++;
      impayeesTotal += num(f.totalTTC);
    }
  }
  const devisEnCours = devis.filter((d) => d.statut === "brouillon" || d.statut === "envoye").length;
  const interventionsAVenir = interventions.filter((i) => i.statut === "planifiee" && new Date(i.dateDebut) >= now).length;
  return {
    caMonth: round2(caMonth),
    caYear: round2(caYear),
    devisEnCours,
    facturesImpayees: { count: impayeesCount, total: round2(impayeesTotal) },
    totalClients,
    interventionsAVenir,
    totalDevis: devis.length,
    totalFactures: factures.length,
    totalInterventions: interventions.length,
    chiffreAffaires: round2(caYear),
    devisEnAttente: devisEnCours,
  };
}

/*
 * getRecentActivity : prend les `limit` plus récents de chaque type (listes déjà triées createdAt desc),
 * fusionne, trie par date desc, tronque à `limit`.
 */
export function computeRecentActivity(devis: readonly DashDevis[], factures: readonly DashFacture[], interventions: readonly DashIntervention[], clients: readonly DashClient[], limit: number): RecentActivityItem[] {
  const out: RecentActivityItem[] = [];
  for (const d of devis.slice(0, limit)) out.push({ type: "devis", titre: `Devis ${d.numero} créé`, date: new Date(d.createdAt), id: d.id });
  for (const f of factures.slice(0, limit)) out.push({ type: "facture", titre: `Facture ${f.numero} ${f.statut === "payee" ? "payée" : "créée"}`, date: new Date(f.createdAt), id: f.id });
  for (const i of interventions.slice(0, limit)) out.push({ type: "intervention", titre: `Intervention "${i.titre}" planifiée`, date: new Date(i.createdAt), id: i.id });
  for (const c of clients.slice(0, limit)) out.push({ type: "client", titre: `Client ${c.prenom || ""} ${c.nom} ajouté`, date: new Date(c.createdAt), id: c.id });
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out.slice(0, limit);
}

/*
 * getMonthlyCAStats : CA HT des lignes CA (payées + avoirs validés) bucketé par mois (dateFacture),
 * sur `months` mois, du plus ancien au plus récent.
 */
export function computeMonthlyCA(facturesCA: readonly DashFacture[], months: number, now: Date): MonthlyCAPoint[] {
  const stats: MonthlyCAPoint[] = [];
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    let ca = 0;
    let count = 0;
    for (const f of facturesCA) {
      const d = new Date(f.dateFacture);
      if (d >= monthStart && d <= monthEnd) {
        ca += num(f.totalHT);
        count++;
      }
    }
    stats.unshift({ month: monthStart.toISOString().slice(0, 7), ca, count });
  }
  return stats;
}

/** getYearlyComparison : CA HT (payées + avoirs validés) année courante vs année précédente (par dateFacture). */
export function computeYearlyComparison(facturesCA: readonly DashFacture[], now: Date): YearlyComparison {
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
  let thisYear = 0;
  let lastYear = 0;
  for (const f of facturesCA) {
    const d = new Date(f.dateFacture);
    if (d >= thisYearStart) thisYear += num(f.totalHT);
    else if (d >= lastYearStart && d <= lastYearEnd) lastYear += num(f.totalHT);
  }
  return { thisYear, lastYear };
}

/*
 * getConversionRate : % de devis « accepte » (arrondi). ⚠️ Parité legacy : renvoie un NOMBRE BRUT (le
 * front lit `.rate`/`.devisAcceptes` → undefined ; quirk legacy préservé, voir finding).
 */
export function computeConversionRate(devis: readonly DashDevis[]): number {
  if (devis.length === 0) return 0;
  const acceptes = devis.filter((d) => d.statut === "accepte").length;
  return Math.round((acceptes / devis.length) * 100);
}

/** getTopClients : clients triés par CA HT total (payées + avoirs déduits), top `limit`. */
export function computeTopClients(factures: readonly DashFacture[], clients: readonly DashClient[], limit: number): TopClient[] {
  return clients
    .map((client) => {
      const cf = factures.filter((f) => f.clientId === client.id);
      return { client, totalCA: cf.reduce((s, f) => s + num(f.totalHT), 0), facturesCount: cf.length };
    })
    .sort((a, b) => b.totalCA - a.totalCA)
    .slice(0, limit);
}

/** getClientEvolution : nb cumulé de clients à la fin de chaque mois, sur `months` mois. */
export function computeClientEvolution(clients: readonly DashClient[], months: number, now: Date): ClientEvolutionPoint[] {
  const stats: ClientEvolutionPoint[] = [];
  for (let i = 0; i < months; i++) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = clients.filter((c) => new Date(c.createdAt) <= monthEnd).length;
    stats.unshift({ month: monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), count });
  }
  return stats;
}

/** getObjectifs : objectifs (paramètres) vs réalisé (CA du mois, devis/clients créés ce mois). */
export function computeObjectifs(objectifs: { objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }, factures: readonly DashFacture[], devis: readonly DashDevis[], clients: readonly DashClient[], now: Date): Objectifs {
  const m = now.getMonth();
  const y = now.getFullYear();
  const stats = computeStats(factures, devis, clients.length, [], now);
  const sameMonth = (d: Date) => d.getMonth() === m && d.getFullYear() === y;
  const devisThisMonth = devis.filter((d) => sameMonth(new Date(d.createdAt))).length;
  const clientsThisMonth = clients.filter((c) => sameMonth(new Date(c.createdAt))).length;
  return {
    objectifCA: num(objectifs.objectifCA),
    currentCA: stats.caMonth || 0,
    objectifDevis: objectifs.objectifDevis || 0,
    currentDevis: devisThisMonth,
    objectifClients: objectifs.objectifClients || 0,
    currentClients: clientsThisMonth,
  };
}

/*
 * getAlerts : factures impayées > 30j (danger), devis envoyés sans réponse > 7j (warning),
 * interventions dans les 48h (info). `now` injecté.
 */
export function computeAlerts(factures: readonly DashFacture[], devis: readonly DashDevis[], interventions: readonly DashIntervention[], now: Date): DashAlert[] {
  const alerts: DashAlert[] = [];
  const days = (ref: Date) => Math.floor((now.getTime() - new Date(ref).getTime()) / 86400000);

  const facturesRetard = factures.filter((f) => f.statut !== "payee" && f.statut !== "annulee" && f.typeDocument !== "avoir" && days(f.createdAt) > 30);
  if (facturesRetard.length > 0) {
    const total = round2(facturesRetard.reduce((s, f) => s + num(f.totalTTC), 0));
    alerts.push({ type: "danger", titre: `${facturesRetard.length} facture(s) en retard de +30 jours`, message: `Montant total : ${total.toFixed(2)} EUR`, lien: "/factures" });
  }

  const devisAttente = devis.filter((d) => d.statut === "envoye" && days(d.createdAt) > 7);
  if (devisAttente.length > 0) {
    alerts.push({ type: "warning", titre: `${devisAttente.length} devis sans reponse depuis +7 jours`, message: "Pensez a relancer vos clients", lien: "/relances" });
  }

  const upcoming48h = interventions.filter((i) => {
    const diffH = (new Date(i.dateDebut).getTime() - now.getTime()) / 3600000;
    return diffH > 0 && diffH <= 48;
  });
  if (upcoming48h.length > 0) {
    alerts.push({ type: "info", titre: `${upcoming48h.length} intervention(s) dans les 48h`, message: upcoming48h.map((i) => i.titre).slice(0, 2).join(", "), lien: "/interventions" });
  }
  return alerts;
}
