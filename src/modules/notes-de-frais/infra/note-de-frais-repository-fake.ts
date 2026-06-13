import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository, NoteDeFraisWorkflowPatch } from "../application/note-de-frais-repository";
import type { NoteDeFrais, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant et les valeurs par défaut PG (`statut` → brouillon, montants → "0", dates workflow
// null). ⚠️ `update` ne touche pas statut/dates workflow/commentaire (réservés au workflow).
export class FakeNoteDeFraisRepository implements INoteDeFraisRepository {
  private store: NoteDeFrais[] = [];
  private seq = 0;

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
    // `input` n'a pas statut/dates workflow → ces champs restent intacts.
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
