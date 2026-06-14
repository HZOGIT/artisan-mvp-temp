import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "./transaction-bancaire-repository";
import type { IDepenseRepository } from "./depense-repository";
import type { IRegleCategorisationRepository } from "../../regles-categorisation/application/regle-categorisation-repository";
import type { TransactionBancaire, ImportReleveResult, ReleveItem } from "../domain/transaction-bancaire";
import type { Depense } from "../domain/depense";
import type { RegleCategorisation } from "../../regles-categorisation/domain/regle-categorisation";
import { parseReleveCsv } from "./parse-releve-csv";

// Use-cases « transactions bancaires » : lecture, ignorer, import de relevé, conversion en dépense.
// Parité legacy `getTransactionsBancaires`/`ignorerTransaction`/`importReleve`/`convertirTransaction`.

export function getTransactionsBancaires(repo: ITransactionBancaireRepository, ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]> {
  return repo.list(ctx, releveId);
}

export async function ignorerTransaction(repo: ITransactionBancaireRepository, ctx: TenantContext, id: number): Promise<{ success: true }> {
  await repo.ignorer(ctx, id);
  return { success: true };
}

// PUR : suggère une catégorie si le libellé contient le motif d'une règle ACTIVE (1ère match).
export function suggererCategorie(libelle: string, regles: readonly RegleCategorisation[]): string | null {
  const lib = String(libelle || "").toUpperCase();
  for (const r of regles) {
    if (r.actif && r.motifLibelle && lib.includes(r.motifLibelle.toUpperCase())) return r.categorie;
  }
  return null;
}

export interface ImportReleveInput {
  readonly nomFichier: string;
  readonly contenuCsv: string;
}

// Importe un relevé CSV : parse (pur) → enrichit chaque transaction d'une catégorie suggérée (règles
// du tenant) → crée le relevé + insère les transactions. CSV vide → {releveId:0, message}.
export async function importReleve(
  deps: { transactionRepo: ITransactionBancaireRepository; regleRepo: IRegleCategorisationRepository },
  ctx: TenantContext,
  input: ImportReleveInput,
): Promise<ImportReleveResult> {
  const transactions = parseReleveCsv(input.contenuCsv); // peut lever ValidationError (>5000 lignes)
  if (transactions.length === 0) return { releveId: 0, nbImportees: 0, message: "CSV vide ou invalide" };
  let regles: RegleCategorisation[] = [];
  try {
    regles = await deps.regleRepo.list(ctx);
  } catch {
    /* suggestion best-effort */
  }
  const items: ReleveItem[] = transactions.map((t) => ({ ...t, categorieSuggeree: suggererCategorie(t.libelle, regles) }));
  return deps.transactionRepo.createReleve(ctx, input.nomFichier, items);
}

export interface ConvertirTransactionInput {
  readonly transactionId: number;
  readonly categorie: string;
  readonly fournisseur?: string;
  readonly description?: string;
}

// Convertit une transaction bancaire en dépense. ⚠️ Idempotence (anti double-dépense → impact
// FEC/TVA) : refuse si la transaction est déjà liée à une dépense (400). TVA 20% dérivée du TTC
// (= |montant| de la transaction). Crée la dépense (numéro serveur) puis lie la transaction.
export async function convertirTransaction(
  deps: { transactionRepo: ITransactionBancaireRepository; depenseRepo: IDepenseRepository },
  ctx: TenantContext,
  input: ConvertirTransactionInput,
): Promise<Depense> {
  const t = await deps.transactionRepo.getById(ctx, input.transactionId);
  if (!t) throw new NotFoundError("Transaction introuvable");
  if (t.depenseId) throw new ValidationError("Transaction déjà convertie en dépense");

  const montantTtc = Math.abs(Number(t.montant) || 0);
  const tauxTva = 20;
  const montantHt = Math.round((montantTtc / (1 + tauxTva / 100)) * 100) / 100;
  const montantTva = Math.round((montantTtc - montantHt) * 100) / 100;
  const libelle = String(t.libelle || "").slice(0, 200);

  const numero = await deps.depenseRepo.nextNumero(ctx);
  const dep = await deps.depenseRepo.create(ctx, {
    userId: ctx.userId,
    numero,
    dateDepense: t.dateTransaction,
    fournisseur: input.fournisseur || libelle,
    categorie: input.categorie,
    description: input.description || libelle,
    montantHt: montantHt.toFixed(2),
    tauxTva: String(tauxTva),
    montantTva: montantTva.toFixed(2),
    montantTtc: montantTtc.toFixed(2),
    modePaiement: "carte",
  });
  await deps.transactionRepo.lierDepense(ctx, input.transactionId, dep.id);
  return dep;
}
