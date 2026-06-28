import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleDevisRepository } from "../application/modele-devis-repository";
import type { CreateModeleDevisInput, CreateModeleDevisLigneInput, ModeleDevis, ModeleDevisLigne, UpdateModeleDevisInput } from "../domain/modele-devis";

interface StoredModele {
  id: number;
  artisanId: number;
  nom: string;
  description: string | null;
  notes: string | null;
  isDefault: boolean;
  dureeValiditeJours: number | null;
  conditionsPaiementDefaut: string | null;
  objetType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/*
 * Implémentation in-memory du repository modeles-devis (tests sans DB). Reproduit les invariants du
 * repo Drizzle : en-tête scopé par artisanId (artisanId forcé à la création), lignes stockées par
 * modeleId et **scopées via le parent** (jamais lisibles sans ownership), remplacement complet des
 * lignes à l'update, list « léger » (lignes = []), isDefault défaut false.
 */
export class FakeModeleDevisRepository implements IModeleDevisRepository {
  private readonly modeles: StoredModele[] = [];
  private readonly lignes = new Map<number, ModeleDevisLigne[]>();
  private seqModele = 0;
  private seqLigne = 0;

  private toLigne(modeleId: number, l: CreateModeleDevisLigneInput, ordreParDefaut: number): ModeleDevisLigne {
    return {
      id: ++this.seqLigne,
      modeleId,
      articleId: l.articleId ?? null,
      designation: l.designation,
      description: l.description ?? null,
      quantite: l.quantite ?? "1.00",
      unite: l.unite ?? "unité",
      prixUnitaireHT: l.prixUnitaireHT ?? "0.00",
      tauxTVA: l.tauxTVA ?? "20.00",
      remise: l.remise ?? "0.00",
      tvaCategorieId: l.tvaCategorieId ?? null,
      ordre: l.ordre ?? ordreParDefaut,
    };
  }

  private aggregate(m: StoredModele): ModeleDevis {
    const lignes = [...(this.lignes.get(m.id) ?? [])].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
    return { ...m, lignes };
  }

  private owned(ctx: TenantContext, id: number): StoredModele | undefined {
    return this.modeles.find((m) => m.id === id && m.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<ModeleDevis[]> {
    return this.modeles
      .filter((m) => m.artisanId === ctx.artisanId)
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.id - b.id)
      .map((m) => ({ ...m, lignes: [] }));
  }

  async getById(ctx: TenantContext, id: number): Promise<ModeleDevis | null> {
    const m = this.owned(ctx, id);
    return m ? this.aggregate(m) : null;
  }

  async create(ctx: TenantContext, input: CreateModeleDevisInput): Promise<ModeleDevis> {
    const now = new Date();
    const m: StoredModele = {
      id: ++this.seqModele,
      artisanId: ctx.artisanId,
      nom: input.nom,
      description: input.description ?? null,
      notes: input.notes ?? null,
      isDefault: input.isDefault ?? false,
      dureeValiditeJours: input.dureeValiditeJours ?? null,
      conditionsPaiementDefaut: input.conditionsPaiementDefaut ?? null,
      objetType: input.objetType ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.modeles.push(m);
    if (input.lignes?.length) {
      this.lignes.set(m.id, input.lignes.map((l, i) => this.toLigne(m.id, l, i + 1)));
    }
    return this.aggregate(m);
  }

  async update(ctx: TenantContext, id: number, input: UpdateModeleDevisInput): Promise<ModeleDevis | null> {
    const m = this.owned(ctx, id);
    if (!m) return null;
    if (input.nom !== undefined) m.nom = input.nom;
    if (input.description !== undefined) m.description = input.description;
    if (input.notes !== undefined) m.notes = input.notes;
    if (input.isDefault !== undefined) m.isDefault = input.isDefault;
    if (input.dureeValiditeJours !== undefined) m.dureeValiditeJours = input.dureeValiditeJours ?? null;
    if (input.conditionsPaiementDefaut !== undefined) m.conditionsPaiementDefaut = input.conditionsPaiementDefaut ?? null;
    if (input.objetType !== undefined) m.objetType = input.objetType ?? null;
    m.updatedAt = new Date();
    if (input.lignes !== undefined) {
      this.lignes.set(id, input.lignes.map((l, i) => this.toLigne(id, l, i + 1)));
    }
    return this.aggregate(m);
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.modeles.findIndex((m) => m.id === id && m.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.modeles.splice(idx, 1);
    this.lignes.delete(id);
    return true;
  }

  async addLigne(ctx: TenantContext, modeleId: number, input: CreateModeleDevisLigneInput): Promise<ModeleDevisLigne | null> {
    if (!this.owned(ctx, modeleId)) return null;
    const existantes = this.lignes.get(modeleId) ?? [];
    const ligne = this.toLigne(modeleId, input, existantes.length + 1);
    this.lignes.set(modeleId, [...existantes, ligne]);
    return ligne;
  }

  /* ponytail: withDb no-op on fake — outbox wraps a real tx, fake ignores it */
  withDb(_db: DbClient): FakeModeleDevisRepository {
    return this;
  }
}
