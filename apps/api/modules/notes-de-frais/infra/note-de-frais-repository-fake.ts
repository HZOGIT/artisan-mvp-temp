import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository, NoteDeFraisWorkflowPatch, DepenseLieeStatut } from "../application/note-de-frais-repository";
import type { NoteDeFrais, NoteFraisDepense, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";
import { computeNextNoteFraisNumero } from "../application/numero";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (`statut` → brouillon, montants → "0", dates workflow
 * null). ⚠️ `update` ne touche pas statut/dates workflow/commentaire (réservés au workflow).
 */
export class FakeNoteDeFraisRepository implements INoteDeFraisRepository {
  private store: NoteDeFrais[] = [];
  private seq = 0;
  /** Dépenses connues (pour les liens) : clé `${artisanId}:${depenseId}` → état minimal. */
  private depenses = new Map<string, { remboursable: boolean; montantTtc: string; statut: string; rembourse: boolean; dateRemboursement: string | null; numero: string; fournisseur: string | null; dateDepense: string; categorie: string }>();
  /** Liens note↔dépense : ensemble de `${noteId}:${depenseId}`. */
  private links = new Set<string>();

  /** Aide de test : déclare une dépense du tenant (pour addDepenseLink / cascade workflow / détail). */
  registerDepense(artisanId: number, depenseId: number, opts: { remboursable: boolean; montantTtc: string; statut?: string; numero?: string; fournisseur?: string | null; dateDepense?: string; categorie?: string }): void {
    this.depenses.set(`${artisanId}:${depenseId}`, {
      remboursable: opts.remboursable, montantTtc: opts.montantTtc, statut: opts.statut ?? "brouillon", rembourse: false, dateRemboursement: null,
      numero: opts.numero ?? `DEP-${depenseId}`, fournisseur: opts.fournisseur ?? null, dateDepense: opts.dateDepense ?? "2026-01-01", categorie: opts.categorie ?? "fournitures",
    });
  }

  /** Aide de test : état d'une dépense après cascade (statut/rembourse/dateRemboursement). */
  depenseEtat(artisanId: number, depenseId: number): { statut: string; rembourse: boolean; dateRemboursement: string | null } | undefined {
    const d = this.depenses.get(`${artisanId}:${depenseId}`);
    return d ? { statut: d.statut, rembourse: d.rembourse, dateRemboursement: d.dateRemboursement } : undefined;
  }

  /** Ids des dépenses liées à une note (pour les assertions de test). */
  linkedDepenseIds(noteId: number): number[] {
    return Array.from(this.links)
      .filter((k) => k.startsWith(`${noteId}:`))
      .map((k) => Number(k.split(":")[1]));
  }

  private recompute(ctx: TenantContext, noteId: number): void {
    let total = 0;
    for (const did of this.linkedDepenseIds(noteId)) {
      const d = this.depenses.get(`${ctx.artisanId}:${did}`);
      if (d && d.remboursable) total += Number(d.montantTtc);
    }
    this.store = this.store.map((n) => (n.id === noteId && n.artisanId === ctx.artisanId ? { ...n, montantTotal: String(total) } : n));
  }

  async getDepensesForNote(ctx: TenantContext, noteId: number): Promise<NoteFraisDepense[]> {
    const note = this.store.find((n) => n.id === noteId && n.artisanId === ctx.artisanId);
    if (!note) return [];
    const out: NoteFraisDepense[] = [];
    for (const did of this.linkedDepenseIds(noteId)) {
      const d = this.depenses.get(`${ctx.artisanId}:${did}`);
      if (!d) continue;
      out.push({ id: did, numero: d.numero, fournisseur: d.fournisseur, dateDepense: d.dateDepense, categorie: d.categorie, montantTtc: d.montantTtc });
    }
    return out;
  }

  async countDepensesByNote(ctx: TenantContext): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    for (const note of this.store.filter((n) => n.artisanId === ctx.artisanId)) {
      const n = this.linkedDepenseIds(note.id).length;
      if (n > 0) map.set(note.id, n);
    }
    return map;
  }

  async addDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void> {
    const note = this.store.find((n) => n.id === noteId && n.artisanId === ctx.artisanId);
    /** note pas au tenant → skip */
    if (!note) return;
    const dep = this.depenses.get(`${ctx.artisanId}:${depenseId}`);
    /** dépense pas au tenant / non remboursable → skip */
    if (!dep || !dep.remboursable) return;
    /** idempotent (Set) */
    this.links.add(`${noteId}:${depenseId}`);
    this.recompute(ctx, noteId);
  }

  async removeDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void> {
    const note = this.store.find((n) => n.id === noteId && n.artisanId === ctx.artisanId);
    if (!note) return;
    this.links.delete(`${noteId}:${depenseId}`);
    this.recompute(ctx, noteId);
  }

  async appliquerStatutDepensesLiees(
    ctx: TenantContext,
    noteId: number,
    patch: { statut: DepenseLieeStatut; rembourse?: boolean; dateRemboursement?: string },
  ): Promise<void> {
    const note = this.store.find((n) => n.id === noteId && n.artisanId === ctx.artisanId);
    /** note pas au tenant → skip */
    if (!note) return;
    for (const did of this.linkedDepenseIds(noteId)) {
      const d = this.depenses.get(`${ctx.artisanId}:${did}`);
      /** dépense pas au tenant / non remboursable → skip */
      if (!d || !d.remboursable) continue;
      d.statut = patch.statut;
      if (patch.rembourse !== undefined) d.rembourse = patch.rembourse;
      if (patch.dateRemboursement !== undefined) d.dateRemboursement = patch.dateRemboursement;
    }
  }

  async nextNumero(ctx: TenantContext): Promise<string> {
    /** Dernière note du tenant (par id décroissant) → numéro suivant (parité legacy). */
    const last = this.store
      .filter((n) => n.artisanId === ctx.artisanId)
      .reduce<NoteDeFrais | null>((acc, n) => (acc === null || n.id > acc.id ? n : acc), null);
    return computeNextNoteFraisNumero(last?.numero ?? "");
  }

  async list(ctx: TenantContext): Promise<NoteDeFrais[]> {
    return this.store.filter((n) => n.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<NoteDeFrais | null> {
    return this.store.find((n) => n.id === id && n.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateNoteDeFraisInput): Promise<NoteDeFrais> {
    const n: NoteDeFrais = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      userId: input.userId,
      numero: input.numero,
      titre: input.titre,
      periodeDebut: input.periodeDebut,
      periodeFin: input.periodeFin,
      statut: "brouillon",
      montantTotal: input.montantTotal ?? "0",
      montantRembourse: input.montantRembourse ?? "0",
      dateSoumission: null,
      dateApprobation: null,
      datePaiement: null,
      commentaireApprobateur: null,
      createdAt: new Date(),
    };
    this.store.push(n);
    return n;
  }

  async update(ctx: TenantContext, id: number, input: UpdateNoteDeFraisInput): Promise<NoteDeFrais | null> {
    const n = await this.getById(ctx, id);
    if (!n) return null;
    /** `input` n'a pas statut/dates workflow → ces champs restent intacts. */
    const updated: NoteDeFrais = { ...n, ...input };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const n = await this.getById(ctx, id);
    if (!n) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async setWorkflow(ctx: TenantContext, id: number, patch: NoteDeFraisWorkflowPatch): Promise<NoteDeFrais | null> {
    const n = await this.getById(ctx, id);
    if (!n) return null;
    const updated: NoteDeFrais = {
      ...n,
      statut: patch.statut,
      dateSoumission: patch.dateSoumission ?? n.dateSoumission,
      dateApprobation: patch.dateApprobation ?? n.dateApprobation,
      datePaiement: patch.datePaiement ?? n.datePaiement,
      commentaireApprobateur:
        patch.commentaireApprobateur !== undefined ? patch.commentaireApprobateur : n.commentaireApprobateur,
    };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }
}
