// Domaine « modules » : catalogue de fonctionnalités activables par artisan + onboarding.
// - `modules` = catalogue GLOBAL (hors tenant, hors RLS) ; `artisan_modules` = activation par tenant
//   (sous RLS) ; l'onboarding (onboardingCompleted/metier/plan) vit sur la table d'identité `artisans`.

// Une entrée du catalogue global (telle quelle, sans état tenant).
export interface ModuleCatalogue {
  readonly id: number;
  readonly slug: string;
  readonly label: string;
  readonly description: string | null;
  readonly icon: string;
  readonly categorie: string;
  readonly planMinimum: string;
  readonly actifParDefaut: boolean;
  readonly ordre: number;
}

// Module enrichi de l'état du tenant courant (activé ? verrouillé par le plan ?). Forme renvoyée par `list`.
export interface ModuleAvecEtat extends ModuleCatalogue {
  readonly actif: boolean;
  readonly locked: boolean;
}

// État d'onboarding du tenant (colonnes de `artisans`).
export interface OnboardingStatus {
  readonly onboardingCompleted: boolean;
  readonly metier: string | null;
  readonly plan: string | null;
}
