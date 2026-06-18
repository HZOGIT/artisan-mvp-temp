import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { Chantier, CreateChantierInput, UpdateChantierInput } from "../domain/chantier";

// Use-cases d'écriture — purs, repository injecté. Validations (reference/nom, avancement,
// budgets, cohérence des dates) + ⚠️ **garde anti-IDOR-FK** : le `clientId` rattaché DOIT
// appartenir au tenant, sinon NotFound (on ne révèle pas l'existence cross-tenant).

function assertAvancement(avancement?: number): void {
  if (avancement != null && (avancement < 0 || avancement > 100)) {
    throw new ValidationError("L'avancement doit être compris entre 0 et 100");
  }
}

function assertBudget(valeur: string | null | undefined, libelle: string): void {
  if (valeur != null && valeur !== "" && Number(valeur) < 0) {
    throw new ValidationError(`${libelle} invalide`);
  }
}

// Dates ISO `YYYY-MM-DD` → comparaison lexicographique = chronologique.
function assertDatesCoherentes(dateDebut?: string | null, dateFinPrevue?: string | null): void {
  if (dateDebut && dateFinPrevue && dateFinPrevue < dateDebut) {
    throw new ValidationError("La fin prévue doit être postérieure ou égale au début");
  }
}

export async function creerChantier(repo: IChantierRepository, ctx: TenantContext, input: CreateChantierInput): Promise<Chantier> {
  if (!input.reference?.trim()) throw new ValidationError("La référence est requise");
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  assertAvancement(input.avancement);
  assertBudget(input.budgetPrevisionnel, "Budget prévisionnel");
  assertBudget(input.budgetRealise, "Budget réalisé");
  assertDatesCoherentes(input.dateDebut, input.dateFinPrevue);
  // Anti-IDOR-FK : le client rattaché doit appartenir au tenant.
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  return repo.create(ctx, input);
}

export async function modifierChantier(
  repo: IChantierRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateChantierInput,
): Promise<Chantier> {
  if (input.reference !== undefined && !input.reference.trim()) throw new ValidationError("La référence est requise");
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Le nom est requis");
  assertAvancement(input.avancement);
  assertBudget(input.budgetPrevisionnel, "Budget prévisionnel");
  assertBudget(input.budgetRealise, "Budget réalisé");
  assertDatesCoherentes(input.dateDebut, input.dateFinPrevue);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Chantier introuvable");
  return updated;
}

export async function supprimerChantier(repo: IChantierRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Chantier introuvable");
}
