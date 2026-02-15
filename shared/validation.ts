/**
 * SCHÉMAS DE VALIDATION RÉUTILISABLES
 * 
 * Ce fichier contient tous les schémas Zod réutilisables pour valider
 * les données entrantes et sortantes de l'API.
 * 
 * Utilisation :
 * - Dans les routers tRPC : input: ClientInputSchema
 * - Dans les tests : ClientInputSchema.parse(data)
 * - Dans les composants React : Utiliser les types générés
 */

import { z } from "zod";

// ============================================================================
// VALIDATIONS COMMUNES
// ============================================================================

/**
 * Email valide
 * - Format RFC 5322 simplifié
 * - Longueur max 254 caractères (RFC 5321)
 */
export const EmailSchema = z
  .string()
  .email("Email invalide")
  .max(254, "Email trop long (max 254 caractères)")
  .toLowerCase();

/**
 * Téléphone français
 * - Accepte formats : 0123456789, 01 23 45 67 89, +33123456789, etc.
 * - Longueur : 9-15 chiffres
 */
export const PhoneSchema = z
  .string()
  .refine(
    (val) => {
      if (!val) return true;
      const digits = val.replace(/[\s.\-+]/g, "");
      return /^\d{10,15}$/.test(digits);
    },
    { message: "Numéro de téléphone invalide" }
  )
  .optional()
  .or(z.literal(""));

/**
 * SIRET (14 chiffres)
 * - Identifiant unique d'un établissement
 * - Format : SIREN (9 chiffres) + NIC (5 chiffres)
 */
export const SiretSchema = z
  .string()
  .regex(/^\d{14}$/, "SIRET invalide (14 chiffres requis)")
  .optional()
  .or(z.literal(""));

/**
 * SIREN (9 chiffres)
 * - Identifiant unique d'une entreprise
 */
export const SirenSchema = z
  .string()
  .regex(/^\d{9}$/, "SIREN invalide (9 chiffres requis)")
  .optional()
  .or(z.literal(""));

/**
 * Code postal français
 * - 5 chiffres
 */
export const CodePostalSchema = z
  .string()
  .regex(/^\d{5}$/, "Code postal invalide (5 chiffres requis)")
  .optional()
  .or(z.literal(""));

/**
 * Chaîne de recherche sécurisée
 * - Longueur : 1-100 caractères
 * - Pas de caractères de contrôle
 * - Échappe les caractères spéciaux SQL (%, _, \)
 */
export const SearchQuerySchema = z
  .string()
  .min(1, "La recherche ne peut pas être vide")
  .max(100, "La recherche est trop longue (max 100 caractères)")
  .transform((val) => {
    // Échapper les caractères spéciaux SQL LIKE
    return val
      .replace(/\\/g, "\\\\") // Backslash d'abord
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
  });

/**
 * Montant monétaire
 * - Positif ou zéro
 * - Max 2 décimales
 * - Max 999 999,99 €
 */
export const MoneySchema = z
  .number()
  .min(0, "Le montant ne peut pas être négatif")
  .max(999999.99, "Le montant est trop élevé")
  .refine(
    (val) => {
      // Vérifier que le nombre a max 2 décimales
      const decimalPlaces = (val.toString().split(".")[1] || "").length;
      return decimalPlaces <= 2;
    },
    "Le montant ne peut avoir plus de 2 décimales"
  );

/**
 * Quantité (nombre entier positif)
 */
export const QuantitySchema = z
  .number()
  .int("La quantité doit être un nombre entier")
  .min(0, "La quantité ne peut pas être négative")
  .max(999999, "La quantité est trop élevée");

/**
 * Pourcentage (0-100)
 */
export const PercentageSchema = z
  .number()
  .min(0, "Le pourcentage ne peut pas être négatif")
  .max(100, "Le pourcentage ne peut pas dépasser 100");

/**
 * Date ISO (YYYY-MM-DD)
 */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)")
  .refine(
    (val) => !isNaN(Date.parse(val)),
    "Date invalide"
  );

/**
 * Identifiant (nombre positif)
 */
export const IdSchema = z
  .number()
  .int("L'ID doit être un nombre entier")
  .positive("L'ID doit être positif");

/**
 * Statut générique
 */
export const StatusSchema = z
  .enum(["actif", "inactif", "archive", "supprime"])
  .optional();

// ============================================================================
// SCHÉMAS CLIENTS
// ============================================================================

export const ClientInputSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(100, "Le nom est trop long (max 100 caractères)")
    .trim(),
  prenom: z
    .string()
    .max(100, "Le prénom est trop long (max 100 caractères)")
    .trim()
    .optional(),
  email: EmailSchema.optional(),
  telephone: PhoneSchema,
  adresse: z
    .string()
    .max(255, "L'adresse est trop longue")
    .optional(),
  codePostal: CodePostalSchema,
  ville: z
    .string()
    .max(100, "La ville est trop longue")
    .optional(),
  siret: SiretSchema,
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type ClientInput = z.infer<typeof ClientInputSchema>;

export const ClientSearchSchema = z.object({
  query: SearchQuerySchema,
});

export type ClientSearch = z.infer<typeof ClientSearchSchema>;

// ============================================================================
// SCHÉMAS ARTICLES
// ============================================================================

export const ArticleSearchSchema = z.object({
  query: SearchQuerySchema,
  metier: z.string().max(50).optional(),
});

export type ArticleSearch = z.infer<typeof ArticleSearchSchema>;

export const ArticleInputSchema = z.object({
  designation: z
    .string()
    .min(1, "La désignation est requise")
    .max(255, "La désignation est trop longue"),
  reference: z
    .string()
    .max(50, "La référence est trop longue")
    .optional(),
  description: z
    .string()
    .max(1000, "La description est trop longue")
    .optional(),
  prixUnitaire: MoneySchema,
  unite: z
    .string()
    .max(20, "L'unité est trop longue")
    .optional(),
  categorie: z
    .string()
    .max(100, "La catégorie est trop longue")
    .optional(),
  metier: z
    .string()
    .max(50, "Le métier est trop long")
    .optional(),
});

export type ArticleInput = z.infer<typeof ArticleInputSchema>;

// ============================================================================
// SCHÉMAS DEVIS
// ============================================================================

export const DevisInputSchema = z.object({
  numeroDevis: z
    .string()
    .min(1, "Le numéro de devis est requis")
    .max(50, "Le numéro de devis est trop long"),
  clientId: IdSchema,
  objet: z
    .string()
    .min(1, "L'objet du devis est requis")
    .max(255, "L'objet est trop long"),
  description: z
    .string()
    .max(2000, "La description est trop longue")
    .optional(),
  dateDevis: DateSchema,
  dateValidite: DateSchema.optional(),
  totalHT: MoneySchema,
  totalTVA: MoneySchema,
  totalTTC: MoneySchema,
  statut: z
    .enum(["brouillon", "envoye", "accepte", "refuse", "expire"])
    .optional(),
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type DevisInput = z.infer<typeof DevisInputSchema>;

export const DevisLineInputSchema = z.object({
  articleId: IdSchema.optional(),
  designation: z
    .string()
    .min(1, "La désignation est requise")
    .max(255, "La désignation est trop longue"),
  quantite: QuantitySchema,
  prixUnitaire: MoneySchema,
  tauxTVA: PercentageSchema.default(20),
  montantHT: MoneySchema,
});

export type DevisLineInput = z.infer<typeof DevisLineInputSchema>;

// ============================================================================
// SCHÉMAS FACTURES
// ============================================================================

export const FactureInputSchema = z.object({
  numeroFacture: z
    .string()
    .min(1, "Le numéro de facture est requis")
    .max(50, "Le numéro de facture est trop long"),
  clientId: IdSchema,
  devisId: IdSchema.optional(),
  dateFacture: DateSchema,
  dateEcheance: DateSchema.optional(),
  totalHT: MoneySchema,
  totalTVA: MoneySchema,
  totalTTC: MoneySchema,
  statut: z
    .enum(["brouillon", "envoyee", "payee", "partiellement_payee", "annulee"])
    .optional(),
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type FactureInput = z.infer<typeof FactureInputSchema>;

// ============================================================================
// SCHÉMAS INTERVENTIONS
// ============================================================================

export const InterventionInputSchema = z.object({
  clientId: IdSchema,
  titre: z
    .string()
    .min(1, "Le titre est requis")
    .max(255, "Le titre est trop long"),
  description: z
    .string()
    .max(2000, "La description est trop longue")
    .optional(),
  dateDebut: DateSchema,
  dateFin: DateSchema.optional(),
  statut: z
    .enum(["planifiee", "en_cours", "terminee", "annulee"])
    .optional(),
  priorite: z
    .enum(["basse", "normale", "haute", "urgente"])
    .optional(),
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type InterventionInput = z.infer<typeof InterventionInputSchema>;

// ============================================================================
// SCHÉMAS STOCKS
// ============================================================================

export const StockInputSchema = z.object({
  designation: z
    .string()
    .min(1, "La désignation est requise")
    .max(255, "La désignation est trop longue"),
  quantiteEnStock: QuantitySchema,
  seuilAlerte: QuantitySchema,
  prixUnitaire: MoneySchema,
  unite: z
    .string()
    .max(20, "L'unité est trop longue")
    .optional(),
  emplacement: z
    .string()
    .max(100, "L'emplacement est trop long")
    .optional(),
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type StockInput = z.infer<typeof StockInputSchema>;

// ============================================================================
// SCHÉMAS FOURNISSEURS
// ============================================================================

export const FournisseurInputSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(100, "Le nom est trop long"),
  email: EmailSchema.optional(),
  telephone: PhoneSchema,
  adresse: z
    .string()
    .max(255, "L'adresse est trop longue")
    .optional(),
  codePostal: CodePostalSchema,
  ville: z
    .string()
    .max(100, "La ville est trop longue")
    .optional(),
  siret: SiretSchema,
  notes: z
    .string()
    .max(1000, "Les notes sont trop longues")
    .optional(),
});

export type FournisseurInput = z.infer<typeof FournisseurInputSchema>;

// ============================================================================
// SCHÉMAS PAGINATION & FILTRAGE
// ============================================================================

export const PaginationSchema = z.object({
  page: z
    .number()
    .int()
    .min(1, "Le numéro de page doit être >= 1")
    .default(1),
  limit: z
    .number()
    .int()
    .min(1, "La limite doit être >= 1")
    .max(100, "La limite ne peut pas dépasser 100")
    .default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const DateRangeSchema = z.object({
  dateDebut: DateSchema.optional(),
  dateFin: DateSchema.optional(),
});

export type DateRange = z.infer<typeof DateRangeSchema>;

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Valider et nettoyer une chaîne de recherche
 */
export function validateSearchQuery(query: string): string {
  return SearchQuerySchema.parse(query);
}

/**
 * Valider un montant monétaire
 */
export function validateMoney(amount: number): number {
  return MoneySchema.parse(amount);
}

/**
 * Valider une date
 */
export function validateDate(dateStr: string): string {
  return DateSchema.parse(dateStr);
}
