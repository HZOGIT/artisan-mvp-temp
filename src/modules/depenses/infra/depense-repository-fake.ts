import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository, DepenseRefKind } from "../application/depense-repository";
import type { Depense, CreateDepenseInput, UpdateDepenseInput } from "../domain/depense";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant et les valeurs par défaut PG (statut brouillon, montants/flags). ⚠️ `update` ne touche
// pas statut/rembourse/dateRemboursement (réservés au workflow).
export class FakeDepenseRepository implements IDepenseRepository {
  private store: Depense[] = [];
  private seq = 0;
  // FK appartenant à un tenant (injectable) : clé `${artisanId}:${kind}:${id}` → owned.
  private ownedRefs = new Set<string>();

  // Aide de test : déclare qu'une ressource référencée (chantier/intervention/client) appartient
  // au tenant. Sert à valider la garde anti-IDOR-FK des use-cases d'écriture.
  registerRef(artisanId: number, kind: DepenseRefKind, id: number): void {
    this.ownedRefs.add(`${artisanId}:${kind}:${id}`);
  }

  async list(ctx: TenantContext): Promise<Depense[]> {
    return this.store.filter((d) => d.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Depense | null> {
    return this.store.find((d) => d.id === id && d.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateDepenseInput): Promise<Depense> {
    const now = new Date();
    const d: Depense = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      userId: input.userId,
      numero: input.numero,
      dateDepense: input.dateDepense,
      fournisseur: input.fournisseur ?? null,
      categorie: input.categorie,
      sousCategorie: input.sousCategorie ?? null,
      description: input.description ?? null,
      montantHt: input.montantHt,
      tauxTva: input.tauxTva ?? "20",
      montantTva: input.montantTva ?? null,
      montantTtc: input.montantTtc,
      modePaiement: input.modePaiement ?? "carte",
      statut: "brouillon",
      remboursable: input.remboursable ?? true,
      rembourse: false,
      dateRemboursement: null,
      chantierId: input.chantierId ?? null,
      interventionId: input.interventionId ?? null,
      clientId: input.clientId ?? null,
      notes: input.notes ?? null,
      justificatifUrl: input.justificatifUrl ?? null,
      justificatifNom: input.justificatifNom ?? null,
      ocrBrut: null,
      ocrTraite: false,
      recurrente: input.recurrente ?? false,
      frequenceRecurrence: input.frequenceRecurrence ?? null,
      prochaineOccurrence: input.prochaineOccurrence ?? null,
      tvaDeductible: input.tvaDeductible ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(d);
    return d;
  }

  async update(ctx: TenantContext, id: number, input: UpdateDepenseInput): Promise<Depense | null> {
    const d = await this.getById(ctx, id);
    if (!d) return null;
    // `input` n'a pas statut/rembourse/dateRemboursement → ces champs restent intacts.
    const updated: Depense = { ...d, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const d = await this.getById(ctx, id);
    if (!d) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async ownsRef(ctx: TenantContext, kind: DepenseRefKind, id: number): Promise<boolean> {
    return this.ownedRefs.has(`${ctx.artisanId}:${kind}:${id}`);
  }
}
