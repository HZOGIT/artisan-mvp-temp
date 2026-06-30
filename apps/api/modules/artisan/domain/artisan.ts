/*
 * Profil de l'artisan = identité/entreprise du tenant (table `artisans`, HORS RLS tenant — c'est la
 * table d'identité résolue par le TenantResolver). Le profil est par construction celui du tenant
 * courant (`ctx.artisanId`) : aucune ressource cross-tenant. Montants/dates exposés tels quels.
 */
export interface ArtisanProfile {
  readonly id: number;
  readonly userId: number | null;
  readonly siret: string | null;
  readonly nomEntreprise: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly telephone: string | null;
  readonly email: string | null;
  readonly specialite: string | null;
  readonly tauxTVA: string | null;
  readonly numeroTVA: string | null;
  readonly iban: string | null;
  readonly codeAPE: string | null;
  readonly formeJuridique: string | null;
  readonly capitalSocial: string | null;
  readonly villeRCS: string | null;
  readonly numeroRM: string | null;
  readonly logo: string | null;
  readonly slug: string | null;
  readonly metier: string | null;
  readonly plan: string | null;
  readonly onboardingCompleted: boolean | null;
  readonly franchiseTVA: boolean;
  readonly assuranceDecennaleNom: string | null;
  readonly assuranceDecennalePolice: string | null;
  readonly assuranceDecennaleGarantie: string | null;
  readonly stripeConnectAccountId: string | null;
  readonly stripeConnectChargesEnabled: boolean;
  readonly stripeConnectPayoutsEnabled: boolean;
  readonly stripeConnectDetailsSubmitted: boolean;
  readonly stripeConnectRequirements: unknown | null;
  readonly stripeConnectStatus: string;
  readonly stripeConnectConnectedAt: Date | null;
  readonly stripeConnectUpdatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Champs modifiables du profil (tous optionnels). `slug`/`iban`/`metier` ont un traitement dédié
 * (normalisation/unicité/validation) dans le use-case.
 */
export interface UpdateArtisanProfileInput {
  readonly siret?: string | null;
  readonly nomEntreprise?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly telephone?: string | null;
  readonly email?: string | null;
  readonly specialite?: string | null;
  readonly tauxTVA?: string | null;
  readonly numeroTVA?: string | null;
  readonly iban?: string | null;
  readonly codeAPE?: string | null;
  readonly formeJuridique?: string | null;
  readonly capitalSocial?: string | null;
  readonly villeRCS?: string | null;
  readonly numeroRM?: string | null;
  readonly logo?: string | null;
  readonly slug?: string | null;
  readonly metier?: string | null;
  readonly franchiseTVA?: boolean;
  readonly assuranceDecennaleNom?: string | null;
  readonly assuranceDecennalePolice?: string | null;
  readonly assuranceDecennaleGarantie?: string | null;
}
