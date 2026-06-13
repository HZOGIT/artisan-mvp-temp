// Types de domaine du module notes-de-frais (RH/compta — remboursement de frais) — découplés
// du schéma Drizzle. ⚠️ Domaine sensible : **anti self-approbation** (l'approbateur ≠ le
// demandeur `userId`), montants exacts (decimal/string, pas de float), isolation cross-tenant.
// Le workflow soumettre/approuver/rejeter/payer est porté aux étapes ultérieures.
//
// NB : la table `notes_de_frais` utilise des colonnes en snake_case (`artisan_id`, `user_id`,
// `periode_debut`…) — le mapping vers ces noms camelCase est fait dans l'infra (Drizzle).

export type NoteDeFraisStatut = "brouillon" | "soumise" | "approuvee" | "rejetee" | "payee";

export interface NoteDeFrais {
  readonly id: number;
  readonly artisanId: number;
  readonly userId: number; // demandeur
  readonly numero: string;
  readonly titre: string;
  readonly periodeDebut: string; // date PG (YYYY-MM-DD)
  readonly periodeFin: string;
  readonly statut: NoteDeFraisStatut;
  readonly montantTotal: string; // numeric PG en string
  readonly montantRembourse: string;
  readonly dateSoumission: string | null;
  readonly dateApprobation: string | null;
  readonly datePaiement: string | null;
  readonly commentaireApprobateur: string | null;
  readonly createdAt: Date | null;
}

export interface CreateNoteDeFraisInput {
  readonly userId: number;
  readonly numero: string;
  readonly titre: string;
  readonly periodeDebut: string;
  readonly periodeFin: string;
  readonly montantTotal?: string;
  readonly montantRembourse?: string;
}

export interface UpdateNoteDeFraisInput {
  // Métadonnées de la note (tant qu'elle est modifiable). ⚠️ `statut`/`dateApprobation`/
  // `commentaireApprobateur`/`datePaiement` ne sont PAS modifiables ici : ils changent via le
  // workflow soumettre/approuver/rejeter/payer (étape ultérieure) qui porte l'anti
  // self-approbation.
  readonly titre?: string;
  readonly periodeDebut?: string;
  readonly periodeFin?: string;
  readonly montantTotal?: string;
  readonly montantRembourse?: string;
}
