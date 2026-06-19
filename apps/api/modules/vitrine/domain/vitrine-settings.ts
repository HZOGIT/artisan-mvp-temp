/*
 * Réglages éditables de la vitrine publique (colonnes `vitrine*` de `parametres_artisan`). Séparés du
 * reader public (`getBySlug`) : ici c'est la surface ADMIN (lecture + écriture par l'artisan, scopée
 * tenant) qui manquait au new-stack. Le front Paramètres `/v2` consomme ces deux
 * procédures pour la section « Ma page vitrine ».
 */

export interface VitrineSettings {
  readonly vitrineActive: boolean;
  readonly vitrineDescription: string | null;
  readonly vitrineZone: string | null;
  readonly vitrineServices: string | null; // JSON string (liste de services) — opaque côté domaine
  readonly vitrineExperience: number | null;
}

// Mise à jour partielle : seuls les champs fournis sont écrits (les autres restent inchangés).
export interface UpdateVitrineSettingsInput {
  readonly vitrineActive?: boolean;
  readonly vitrineDescription?: string | null;
  readonly vitrineZone?: string | null;
  readonly vitrineServices?: string | null;
  readonly vitrineExperience?: number | null;
}

export const DEFAULT_VITRINE_SETTINGS: VitrineSettings = {
  vitrineActive: false,
  vitrineDescription: null,
  vitrineZone: null,
  vitrineServices: null,
  vitrineExperience: null,
};
