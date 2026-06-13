import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository, DepenseRefKind } from "./depense-repository";
import type { Depense, CreateDepenseInput, UpdateDepenseInput } from "../domain/depense";
import { calculerTva } from "./tva";

// Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine sensible (compta) :
//  - **TVA dérivée côté serveur** : `montantTva`/`montantTtc` sont TOUJOURS recalculés à partir
//    de `montantHt` + `tauxTva` (parité legacy `depensesRouter.create`) → jamais acceptés du
//    client (pas de TTC falsifiable).
//  - **userId forcé** à `ctx.userId` (le créateur), jamais usurpable.
//  - **anti-IDOR-FK** : toute FK fournie (chantier/intervention/client) DOIT appartenir au
//    tenant, sinon NotFound (on ne révèle pas l'existence cross-tenant).
//  - montants ≥ 0, taux ∈ [0,100], numero/categorie non vides.

const REF_LABEL: Record<DepenseRefKind, string> = {
  chantier: "Chantier",
  intervention: "Intervention",
  client: "Client",
};

// Entrée de création : pas de userId (forcé) ni de montants TVA (dérivés). tauxTva optionnel.
export type CreerDepenseInput = Omit<CreateDepenseInput, "userId" | "montantTva" | "montantTtc">;
// Entrée de modification : montants TVA dérivés (recalculés si montantHt/tauxTva changent).
export type ModifierDepenseInput = Omit<UpdateDepenseInput, "montantTva" | "montantTtc">;

async function assertRefOwned(
  repo: IDepenseRepository,
  ctx: TenantContext,
  kind: DepenseRefKind,
  id: number,
): Promise<void> {
  if (!(await repo.ownsRef(ctx, kind, id))) {
    throw new NotFoundError(`${REF_LABEL[kind]} introuvable`);
  }
}

function assertMontantValide(montantHt: string): void {
  const ht = Number(montantHt);
  if (!Number.isFinite(ht) || ht < 0) throw new ValidationError("Le montant HT doit être un nombre positif");
}

function assertTauxValide(tauxTva: string): void {
  const taux = Number(tauxTva);
  if (!Number.isFinite(taux) || taux < 0 || taux > 100) {
    throw new ValidationError("Le taux de TVA doit être compris entre 0 et 100");
  }
}

// Vérifie l'ownership des FK fournies (anti-IDOR-FK). `null` = on détache, pas de vérif.
async function assertFksOwned(
  repo: IDepenseRepository,
  ctx: TenantContext,
  input: { chantierId?: number | null; interventionId?: number | null; clientId?: number | null },
): Promise<void> {
  if (input.chantierId != null) await assertRefOwned(repo, ctx, "chantier", input.chantierId);
  if (input.interventionId != null) await assertRefOwned(repo, ctx, "intervention", input.interventionId);
  if (input.clientId != null) await assertRefOwned(repo, ctx, "client", input.clientId);
}

export async function creerDepense(
  repo: IDepenseRepository,
  ctx: TenantContext,
  input: CreerDepenseInput,
): Promise<Depense> {
  if (!input.numero?.trim()) throw new ValidationError("Le numéro est requis");
  if (!input.categorie?.trim()) throw new ValidationError("La catégorie est requise");
  assertMontantValide(input.montantHt);
  const tauxTva = input.tauxTva ?? "20";
  assertTauxValide(tauxTva);
  await assertFksOwned(repo, ctx, input);
  // TVA dérivée côté serveur + userId forcé au créateur.
  const { montantTva, montantTtc } = calculerTva(input.montantHt, tauxTva);
  return repo.create(ctx, { ...input, tauxTva, userId: ctx.userId, montantTva, montantTtc });
}

export async function modifierDepense(
  repo: IDepenseRepository,
  ctx: TenantContext,
  id: number,
  input: ModifierDepenseInput,
): Promise<Depense> {
  if (input.numero !== undefined && !input.numero.trim()) throw new ValidationError("Le numéro est requis");
  if (input.categorie !== undefined && !input.categorie.trim()) throw new ValidationError("La catégorie est requise");
  if (input.montantHt !== undefined) assertMontantValide(input.montantHt);
  if (input.tauxTva != null) assertTauxValide(input.tauxTva);
  await assertFksOwned(repo, ctx, input);

  // État courant (scopé tenant) requis pour recalculer la TVA sur les valeurs effectives.
  const current = await repo.getById(ctx, id);
  if (!current) throw new NotFoundError("Dépense introuvable");

  // Recalcule montantTva/montantTtc dès que montantHt OU tauxTva change (TVA dérivée).
  const patch: { -readonly [K in keyof UpdateDepenseInput]: UpdateDepenseInput[K] } = { ...input };
  if (input.montantHt !== undefined || input.tauxTva !== undefined) {
    const montantHt = input.montantHt ?? current.montantHt;
    const tauxTva = input.tauxTva ?? current.tauxTva ?? "20";
    const { montantTva, montantTtc } = calculerTva(montantHt, tauxTva);
    patch.tauxTva = tauxTva;
    patch.montantTva = montantTva;
    patch.montantTtc = montantTtc;
  }

  const updated = await repo.update(ctx, id, patch);
  if (!updated) throw new NotFoundError("Dépense introuvable");
  return updated;
}

export async function supprimerDepense(
  repo: IDepenseRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Dépense introuvable");
}
