import type { TenantContext } from "../../../shared/tenant";
import type { IEcritureRepository } from "./ecriture-repository";
import type { IFactureReader, FactureReadModel } from "./facture-reader";
import type { EcritureComptable, CreateEcritureInput } from "../domain/ecriture";
import { COMPTE_CLIENT, COMPTE_VENTES, COMPTE_BANQUE, COMPTE_ACHATS, COMPTE_TVA_DEDUCTIBLE, COMPTE_FOURNISSEURS, COMPTE_PERSONNEL, compteTvaCollectee } from "./comptes";

/*
 * Génération des écritures comptables de VENTE d'une facture (parité legacy
 * `genererEcrituresFacture`). ⚠️ CŒUR FEC — invariant **Σ débit = Σ crédit** par pièce.
 *  - Facture : 411 Clients (TTC) **débit** / 706 Ventes (HT) **crédit** / 445 TVA collectée
 *    (ventilée par taux) **crédit**.
 *  - Avoir (note de crédit) : **sens inversé** (411 crédit / 706+445 débit), montants en
 *    **valeur absolue** (jamais de débit/crédit négatif).
 *  - **Idempotence** : on purge les écritures de la facture avant de réinsérer la pièce.
 */

interface LigneVentilee {
  readonly compte: string;
  readonly lib: string;
  /** valeur absolue, > 0 */
  readonly montant: number;
}

/*
 * Ventile la TVA par taux depuis les lignes ; repli sur le total (445711) si lignes vides ou
 * incohérentes avec le total (tolérance 0,02). Montants en valeur absolue (avoir = lignes < 0).
 */
function ventilerTva(lignes: readonly { tauxTVA: string; montantTVA: string }[], totalTVA: number): LigneVentilee[] {
  if (totalTVA <= 0) return [];
  const parCompte = new Map<string, LigneVentilee>();
  let somme = 0;
  for (const l of lignes) {
    const m = Math.abs(Number(l.montantTVA) || 0);
    if (m <= 0) continue;
    somme += m;
    const c = compteTvaCollectee(Number(l.tauxTVA) || 20);
    const cur = parCompte.get(c.compte) ?? { compte: c.compte, lib: c.lib, montant: 0 };
    parCompte.set(c.compte, { ...cur, montant: cur.montant + m });
  }
  if (parCompte.size > 0 && Math.abs(somme - totalTVA) < 0.02) return Array.from(parCompte.values());
  const repli = compteTvaCollectee(20);
  return [{ compte: repli.compte, lib: repli.lib, montant: totalTVA }];
}

export async function genererEcrituresVente(
  ecritureRepo: IEcritureRepository,
  factureReader: IFactureReader,
  ctx: TenantContext,
  factureId: number,
): Promise<EcritureComptable[]> {
  const facture = await factureReader.getFacture(ctx, factureId);
  /** facture absente / hors tenant → rien à générer */
  if (!facture) return [];

  const isAvoir = facture.typeDocument === "avoir" || Number(facture.totalTTC) < 0;
  const totalHT = Math.abs(Number(facture.totalHT) || 0);
  const totalTVA = Math.abs(Number(facture.totalTVA) || 0);
  const totalTTC = Math.abs(Number(facture.totalTTC) || 0);
  const pieceRef = facture.numero ?? "";
  const dateEcriture = facture.dateFacture;
  const libelle = `${isAvoir ? "Avoir" : "Facture"} ${pieceRef}`;

  /*
   * Sens des comptes : un compte « naturellement débit » (411) est débité pour une facture,
   * crédité pour un avoir ; inverse pour les comptes « naturellement crédit » (706/445).
   */
  const fmt = (n: number) => n.toFixed(2);
  const debitFacture = (montant: number): Pick<CreateEcritureInput, "debit" | "credit"> =>
    isAvoir ? { credit: fmt(montant) } : { debit: fmt(montant) };
  const creditFacture = (montant: number): Pick<CreateEcritureInput, "debit" | "credit"> =>
    isAvoir ? { debit: fmt(montant) } : { credit: fmt(montant) };

  const base = { dateEcriture, journal: "VE" as const, pieceRef, libelle, factureId };
  const lignes: CreateEcritureInput[] = [
    { ...base, numeroCompte: COMPTE_CLIENT.compte, libelleCompte: COMPTE_CLIENT.lib, ...debitFacture(totalTTC) },
    { ...base, numeroCompte: COMPTE_VENTES.compte, libelleCompte: COMPTE_VENTES.lib, ...creditFacture(totalHT) },
  ];
  const lignesFacture = await factureReader.getLignes(ctx, factureId);
  /** Autoliquidation BTP (CGI art. 283-2 nonies) : la TVA est due par le preneur → pas de 445 collectée. */
  if (facture.regimeTVA !== "autoliquidation_btp") {
    for (const t of ventilerTva(lignesFacture, totalTVA)) {
      lignes.push({ ...base, numeroCompte: t.compte, libelleCompte: t.lib, ...creditFacture(t.montant) });
    }
  }

  if (await ecritureRepo.hasValidatedEcritures(ctx, factureId)) {
    return [];
  }

  await ecritureRepo.deleteByFacture(ctx, factureId);
  return ecritureRepo.createMany(ctx, lignes);
}

/*
 * Génération des écritures d'ENCAISSEMENT au règlement (parité legacy
 * `genererEcrituresEncaissement`). Journal **BQ** : **512 Banque débit** / **411 Clients crédit**
 * (TTC réglé), lettrées entre elles. Ne génère que si la facture est **payée** et TTC > 0 (un
 * avoir [TTC ≤ 0] n'a pas d'encaissement). **Idempotence sélective** : purge les écritures BQ de
 * la facture avant insert, sans toucher la pièce de vente (VE).
 */
export async function genererEcrituresEncaissement(
  ecritureRepo: IEcritureRepository,
  factureReader: IFactureReader,
  ctx: TenantContext,
  factureId: number,
  facture?: FactureReadModel,
): Promise<EcritureComptable[]> {
  const _facture = facture ?? (await factureReader.getFacture(ctx, factureId));
  if (!_facture) return [];

  /** Idempotence sélective (BQ uniquement — on ne touche pas la vente VE). */
  await ecritureRepo.deleteByFactureJournal(ctx, factureId, "BQ");

  const ttc = Number(_facture.totalTTC) || 0;
  /** pas réglée / avoir → pas d'encaissement */
  if (_facture.statut !== "payee" || ttc <= 0) return [];

  const dateEcriture = _facture.datePaiement ?? _facture.dateFacture;
  const pieceRef = _facture.numero ?? "";
  const libelle = `Règlement ${pieceRef}`;
  const lettrage = `VL${factureId}`;
  const base = { dateEcriture, journal: "BQ" as const, pieceRef, libelle, factureId, lettrage };
  const montant = ttc.toFixed(2);
  const lignes: CreateEcritureInput[] = [
    { ...base, numeroCompte: COMPTE_BANQUE.compte, libelleCompte: COMPTE_BANQUE.lib, debit: montant },
    { ...base, numeroCompte: COMPTE_CLIENT.compte, libelleCompte: COMPTE_CLIENT.lib, credit: montant },
  ];
  return ecritureRepo.createMany(ctx, lignes);
}

/** Champs minimaux d'une dépense pour générer les écritures AC. */
export interface DepenseAchatInput {
  readonly numero: string;
  readonly dateDepense: string;
  readonly fournisseur?: string | null;
  readonly montantHt: string;
  readonly montantTva?: string | null;
  readonly montantTtc: string;
  readonly tvaDeductible?: boolean;
  /** Coefficient de déductibilité TVA en % (0–100). Défaut 100. */
  readonly coeffDeductibilite?: string;
  readonly remboursable?: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/*
 * Génère les écritures AC (journal achats) pour une dépense dans `ecritures_comptables`.
 * Invariant Σdébit=Σcrédit : chargeHt + tvaDed = HT + TVA = TTC.
 * Idempotent : purge les AC existantes (pieceRef=depense.numero) avant insert.
 * 3 lignes : 607 Achats (débit HT+TVAnondéd) / 445660 TVA déductible (débit) / 401 Fournisseurs (crédit TTC).
 */
export async function genererEcrituresAchat(
  ecritureRepo: IEcritureRepository,
  ctx: TenantContext,
  depense: DepenseAchatInput,
): Promise<EcritureComptable[]> {
  const ttc = Number(depense.montantTtc) || 0;
  if (ttc <= 0) return [];

  const tvaDeductible = depense.tvaDeductible !== false;
  const montantTva = Number(depense.montantTva ?? "0");
  const coeff = Number(depense.coeffDeductibilite ?? "100");
  const tvaDed = tvaDeductible ? r2(montantTva * coeff / 100) : 0;
  const chargeHt = r2(Number(depense.montantHt) + montantTva - tvaDed);

  const dateEcriture = new Date(depense.dateDepense);
  const pieceRef = depense.numero;
  const libelle = `Achat ${pieceRef}${depense.fournisseur ? ` ${depense.fournisseur}` : ""}`.trim();
  const base = { dateEcriture, journal: "AC" as const, pieceRef, libelle };
  const fmt = (n: number) => n.toFixed(2);

  const lignes: CreateEcritureInput[] = [];
  if (chargeHt > 0) {
    lignes.push({ ...base, numeroCompte: COMPTE_ACHATS.compte, libelleCompte: COMPTE_ACHATS.lib, debit: fmt(chargeHt) });
  }
  if (tvaDed > 0) {
    lignes.push({ ...base, numeroCompte: COMPTE_TVA_DEDUCTIBLE.compte, libelleCompte: COMPTE_TVA_DEDUCTIBLE.lib, debit: fmt(tvaDed) });
  }
  const contrepartie = depense.remboursable ? COMPTE_PERSONNEL : COMPTE_FOURNISSEURS;
  lignes.push({ ...base, numeroCompte: contrepartie.compte, libelleCompte: contrepartie.lib, credit: fmt(ttc) });

  await ecritureRepo.deleteByJournalPieceRef(ctx, "AC", pieceRef);
  return ecritureRepo.createMany(ctx, lignes);
}

/*
 * Valide (verrouille) les écritures d'une facture — passage du statut brouillon → validée.
 * Une fois validées, elles ne peuvent plus être supprimées/réécrites (guard dans genererEcrituresVente).
 * Typiquement appelé quand une facture passe en statut payée / en retard.
 */
export async function validerEcritures(
  ecritureRepo: IEcritureRepository,
  ctx: TenantContext,
  factureId: number,
): Promise<number> {
  return ecritureRepo.validateByFacture(ctx, factureId);
}
