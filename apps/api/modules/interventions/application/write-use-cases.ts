import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository, InterventionRefKind } from "./intervention-repository";
import type { Intervention, CreateInterventionInput, UpdateInterventionInput } from "../domain/intervention";

/*
 * Use-cases d'écriture — purs, repository injecté. Validation métier (titre, cohérence des
 * dates) + ⚠️ **garde anti-IDOR-FK** : toute FK fournie (client/technicien/devis/facture)
 * DOIT appartenir au tenant, sinon NotFound (on ne révèle pas l'existence cross-tenant).
 */

const REF_LABEL: Record<InterventionRefKind, string> = {
  client: "Client",
  technicien: "Technicien",
  devis: "Devis",
  facture: "Facture",
};

async function assertRefOwned(
  repo: IInterventionRepository,
  ctx: TenantContext,
  kind: InterventionRefKind,
  id: number,
): Promise<void> {
  if (!(await repo.ownsRef(ctx, kind, id))) {
    throw new NotFoundError(`${REF_LABEL[kind]} introuvable`);
  }
}

function assertDatesCoherentes(dateDebut?: Date, dateFin?: Date | null): void {
  if (dateDebut && dateFin && dateFin.getTime() < dateDebut.getTime()) {
    throw new ValidationError("La date de fin doit être postérieure à la date de début");
  }
}

export async function creerIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  input: CreateInterventionInput,
): Promise<Intervention> {
  if (!input.titre?.trim()) throw new ValidationError("Le titre est requis");
  assertDatesCoherentes(input.dateDebut, input.dateFin ?? undefined);
  /** Ownership des FK (anti-IDOR-FK) AVANT insertion. clientId est requis ; les autres si fournies. */
  await assertRefOwned(repo, ctx, "client", input.clientId);
  if (input.technicienId != null) await assertRefOwned(repo, ctx, "technicien", input.technicienId);
  if (input.devisId != null) await assertRefOwned(repo, ctx, "devis", input.devisId);
  if (input.factureId != null) await assertRefOwned(repo, ctx, "facture", input.factureId);
  return repo.create(ctx, input);
}

export async function modifierIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateInterventionInput,
): Promise<Intervention> {
  if (input.titre !== undefined && !input.titre.trim()) throw new ValidationError("Le titre est requis");
  assertDatesCoherentes(input.dateDebut, input.dateFin ?? undefined);
  /** Une FK (re)liée doit appartenir au tenant (anti-IDOR-FK). `null` = on détache, pas de vérif. */
  if (input.technicienId != null) await assertRefOwned(repo, ctx, "technicien", input.technicienId);
  if (input.devisId != null) await assertRefOwned(repo, ctx, "devis", input.devisId);
  if (input.factureId != null) await assertRefOwned(repo, ctx, "facture", input.factureId);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Intervention introuvable");
  return updated;
}

export async function supprimerIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Intervention introuvable");
}
