import type { RouterInputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `vitrine-public` (vitrine artisan publique par slug). Thème par spécialité,
// helpers de présentation + constructeur JSON-LD SEO PURS testables. 0 React/tRPC.

// ⚠️ `vitrine.getBySlug` est typé `Promise<unknown>` côté backend (le legacy lisait via `any`) → on déclare
// ici la forme réellement renvoyée par le use-case ; l'application caste à la frontière.
export type VitrineArtisan = {
  nomEntreprise: string | null; specialite: string | null; telephone: string | null; email: string | null;
  ville: string | null; codePostal: string | null; adresse: string | null; siret: string | null; logo: string | null;
};
export type VitrineAvis = {
  id: number; clientNom: string; note: number; createdAt: string | Date | null;
  commentaire: string | null; reponseArtisan: string | null; interventionId: number | null;
};
export type VitrineAvisStats = { moyenne: number; total: number; distribution: Record<number, number> };
export type VitrineData = {
  artisan: VitrineArtisan;
  vitrine: { description: string | null; zone: string | null; services: string[]; experience: number | null };
  avis: VitrineAvis[];
  avisStats: VitrineAvisStats;
  publicStats: { totalClients: number; totalInterventions: number };
};
export type SubmitContactInput = RouterInputs["vitrine"]["submitContact"];

export type SpecialiteKey = "plomberie" | "electricite" | "chauffage" | "jardinage" | "autre" | "multi-services";
export type SpecTheme = { hex: string; gradient: string; light: string; labelKey: string; iconKey: SpecialiteKey };

// Thème de marque par spécialité (couleurs + clé d'icône, l'icône Lucide est résolue en UI). PUR.
export const SPEC_THEME: Record<SpecialiteKey, SpecTheme> = {
  plomberie: { hex: "#2563eb", gradient: "from-blue-600 to-blue-800", light: "bg-blue-50", labelKey: "themePlomberie", iconKey: "plomberie" },
  electricite: { hex: "#f59e0b", gradient: "from-amber-500 to-orange-600", light: "bg-amber-50", labelKey: "themeElectricite", iconKey: "electricite" },
  chauffage: { hex: "#ef4444", gradient: "from-rose-600 to-red-700", light: "bg-rose-50", labelKey: "themeChauffage", iconKey: "chauffage" },
  jardinage: { hex: "#22c55e", gradient: "from-emerald-500 to-green-700", light: "bg-emerald-50", labelKey: "themeJardinage", iconKey: "jardinage" },
  "multi-services": { hex: "#6366f1", gradient: "from-indigo-600 to-violet-700", light: "bg-indigo-50", labelKey: "themeMulti", iconKey: "multi-services" },
  autre: { hex: "#6366f1", gradient: "from-indigo-600 to-violet-700", light: "bg-indigo-50", labelKey: "themeArtisan", iconKey: "autre" },
};

export function getTheme(specialite: string | null | undefined): SpecTheme {
  return SPEC_THEME[(specialite || "autre") as SpecialiteKey] || SPEC_THEME.autre;
}

// Initiales (2 lettres) d'un nom d'entreprise. PUR.
export function computeInitials(name: string | null | undefined): string {
  return (name || "Artisan").split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();
}

// Nom client raccourci « Prénom N. ». PUR.
export function clientNameShort(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || "Client";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

// Année de création = année courante − expérience (null si non exploitable). PUR.
export function anneeCreation(experience: number | null | undefined, now: Date = new Date()): number | null {
  if (typeof experience !== "number" || experience < 1) return null;
  return now.getFullYear() - experience;
}

// Données structurées schema.org (rich snippet « étoiles » Google) depuis les stats déjà calculées. PUR.
export function buildJsonLd(artisan: VitrineArtisan, avisStats: VitrineAvisStats, avis: readonly VitrineAvis[], url: string | null, hasRating: boolean): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: artisan.nomEntreprise || "Artisan",
  };
  if (artisan.telephone) ld.telephone = artisan.telephone;
  if (artisan.logo) ld.image = artisan.logo;
  if (artisan.ville || artisan.codePostal) {
    ld.address = {
      "@type": "PostalAddress",
      ...(artisan.codePostal ? { postalCode: artisan.codePostal } : {}),
      ...(artisan.ville ? { addressLocality: artisan.ville } : {}),
      addressCountry: "FR",
    };
  }
  if (url) ld.url = url;
  if (hasRating) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: avisStats.moyenne, reviewCount: avisStats.total, bestRating: 5, worstRating: 1 };
    ld.review = avis.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.clientNom || "Client" },
      reviewRating: { "@type": "Rating", ratingValue: r.note, bestRating: 5, worstRating: 1 },
      ...(r.createdAt ? { datePublished: new Date(r.createdAt).toISOString().slice(0, 10) } : {}),
      ...(r.commentaire ? { reviewBody: String(r.commentaire) } : {}),
    }));
  }
  return ld;
}

// Message de contact préfixé du type de prestation. PUR.
export function buildContactMessage(type: string, message: string): string {
  return `${type ? `[${type}] ` : ""}${message}`;
}
