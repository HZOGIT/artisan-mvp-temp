import type { TenantContext } from "../../../shared/tenant";
import type { IDashboardReader, ListOpts } from "../application/dashboard-reader";
import type { DashClient, DashDevis, DashFacture, DashIntervention, DashboardSummaryStats, UpcomingInterventionItem } from "../domain/dashboard";

interface TenantData {
  factures: DashFacture[];
  devis: DashDevis[];
  clients: DashClient[];
  interventions: DashIntervention[];
  objectifs: { objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null };
  upcoming: UpcomingInterventionItem[];
}

const EMPTY = (): TenantData => ({ factures: [], devis: [], clients: [], interventions: [], objectifs: { objectifCA: null, objectifDevis: null, objectifClients: null }, upcoming: [] });

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const isCALine = (f: DashFacture) => f.statut === "payee" || (f.typeDocument === "avoir" && f.statut === "validee");
const sameYM = (d: Date, year: number, month: number) => d.getFullYear() === year && d.getMonth() + 1 === month;

/**
 * Fake in-memory déterministe : lots du dashboard par tenant. Les `list*` sont supposés déjà triés
 * createdAt desc par l'appelant du seed (comme le ferait le reader réel).
 */
export class FakeDashboardReader implements IDashboardReader {
  private readonly data = new Map<number, TenantData>();

  private of(artisanId: number): TenantData {
    let d = this.data.get(artisanId);
    if (!d) {
      d = EMPTY();
      this.data.set(artisanId, d);
    }
    return d;
  }

  seed(artisanId: number, patch: Partial<TenantData>): void {
    Object.assign(this.of(artisanId), patch);
  }

  getSummaryStats(ctx: TenantContext, now = new Date()): Promise<DashboardSummaryStats> {
    const d = this.of(ctx.artisanId);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let caMonth = 0;
    let caYear = 0;
    let impayeesCount = 0;
    let impayeesTotal = 0;
    for (const f of d.factures) {
      if (isCALine(f)) {
        const ref = new Date(f.datePaiement ?? f.createdAt);
        if (ref.getFullYear() === year) {
          caYear += toNum(f.totalHT);
          if (ref.getMonth() + 1 === month) caMonth += toNum(f.totalHT);
        }
      }
      if (f.statut !== "payee" && f.statut !== "annulee" && f.statut !== "brouillon" && f.typeDocument !== "avoir") {
        impayeesCount++;
        impayeesTotal += toNum(f.totalTTC);
      }
    }

    const devisEnCours = d.devis.filter((dv) => dv.statut === "brouillon" || dv.statut === "envoye").length;
    const devisAcceptes = d.devis.filter((dv) => dv.statut === "accepte").length;
    const devisThisMonth = d.devis.filter((dv) => sameYM(new Date(dv.createdAt), year, month)).length;
    const clientsThisMonth = d.clients.filter((c) => sameYM(new Date(c.createdAt), year, month)).length;
    const interventionsAVenir = d.interventions.filter((i) => i.statut === "planifiee" && new Date(i.dateDebut) >= now).length;

    return Promise.resolve({
      caMonth, caYear,
      facturesImpayeesCount: impayeesCount,
      facturesImpayeesTotal: impayeesTotal,
      devisEnCours, devisAcceptes, devisThisMonth,
      totalClients: d.clients.length,
      clientsThisMonth,
      totalDevis: d.devis.length,
      totalFactures: d.factures.length,
      totalInterventions: d.interventions.length,
      interventionsAVenir,
    });
  }

  listFactures(ctx: TenantContext, opts?: ListOpts): Promise<DashFacture[]> {
    const since = opts?.since;
    let rows = [...this.of(ctx.artisanId).factures];
    if (since) rows = rows.filter((r) => new Date(r.createdAt) >= since);
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return Promise.resolve(rows);
  }

  listDevis(ctx: TenantContext, opts?: ListOpts): Promise<DashDevis[]> {
    const since = opts?.since;
    let rows = [...this.of(ctx.artisanId).devis];
    if (since) rows = rows.filter((r) => new Date(r.createdAt) >= since);
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return Promise.resolve(rows);
  }

  listClients(ctx: TenantContext, opts?: ListOpts): Promise<DashClient[]> {
    const since = opts?.since;
    let rows = [...this.of(ctx.artisanId).clients];
    if (since) rows = rows.filter((r) => new Date(r.createdAt) >= since);
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return Promise.resolve(rows);
  }

  listInterventions(ctx: TenantContext, opts?: ListOpts): Promise<DashIntervention[]> {
    const since = opts?.since;
    let rows = [...this.of(ctx.artisanId).interventions];
    if (since) rows = rows.filter((r) => new Date(r.createdAt) >= since);
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return Promise.resolve(rows);
  }

  getObjectifs(ctx: TenantContext): Promise<{ objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }> {
    return Promise.resolve(this.of(ctx.artisanId).objectifs);
  }

  getUpcomingInterventions(ctx: TenantContext): Promise<UpcomingInterventionItem[]> {
    return Promise.resolve([...this.of(ctx.artisanId).upcoming]);
  }
}
