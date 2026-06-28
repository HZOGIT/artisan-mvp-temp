/*
 * Types de domaine du module clients (CRM) — découplés du schéma Drizzle.
 * ⚠️ Données personnelles (PII : nom, e-mail, téléphone, adresse, SIRET/TVA) : isolation
 * cross-tenant stricte (historique d'IDOR/fuite PII). Domaine fondamental réutilisé par
 * devis/factures/interventions → la suppression doit préserver l'intégrité référentielle.
 */

export type ClientType = "particulier" | "professionnel";

export interface Client {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly adresseFacturation: string | null;
  readonly codePostalFacturation: string | null;
  readonly villeFacturation: string | null;
  readonly type: ClientType;
  readonly raisonSociale: string | null;
  readonly siret: string | null;
  readonly numeroTVA: string | null;
  readonly etiquettes: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateClientInput {
  readonly nom: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly adresseFacturation?: string | null;
  readonly codePostalFacturation?: string | null;
  readonly villeFacturation?: string | null;
  readonly type?: ClientType;
  readonly raisonSociale?: string | null;
  readonly siret?: string | null;
  readonly numeroTVA?: string | null;
  readonly etiquettes?: string | null;
  readonly notes?: string | null;
}

/*
 * Règle PURE de fusion : complète les champs VIDES du survivant à partir du doublon (on ne
 * surcharge jamais une donnée déjà saisie sur le survivant). Renvoie uniquement les champs à
 * mettre à jour (objet vide si le survivant est déjà complet → update no-op, idempotent). Le
 * `type` passe à "professionnel" si le doublon l'est et que le survivant est resté "particulier".
 */
export function champsFusionnes(survivant: Client, doublon: Client): UpdateClientInput {
  const out: Record<string, unknown> = {};
  const champs = [
    "prenom", "email", "telephone", "adresse", "codePostal", "ville",
    "adresseFacturation", "codePostalFacturation", "villeFacturation",
    "raisonSociale", "siret", "numeroTVA", "etiquettes", "notes",
  ] as const;
  for (const k of champs) {
    const actuel = survivant[k];
    const candidat = doublon[k];
    if ((actuel == null || actuel === "") && candidat != null && candidat !== "") {
      out[k] = candidat;
    }
  }
  if (survivant.type === "particulier" && doublon.type === "professionnel") {
    out.type = "professionnel";
  }
  return out as UpdateClientInput;
}

export interface UpdateClientInput {
  readonly nom?: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly adresseFacturation?: string | null;
  readonly codePostalFacturation?: string | null;
  readonly villeFacturation?: string | null;
  readonly type?: ClientType;
  readonly raisonSociale?: string | null;
  readonly siret?: string | null;
  readonly numeroTVA?: string | null;
  readonly etiquettes?: string | null;
  readonly notes?: string | null;
}
