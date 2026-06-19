import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `onboarding` (wizard post-signup : métier → modules). Catalogues + logique de
 * recommandation/payload PURS testables. 0 React/tRPC.
 */

export type Module = RouterOutputs["modules"]["list"][number];
export type CompleteOnboardingInput = RouterInputs["modules"]["completeOnboarding"];
export type Step = 1 | 2 | 3 | 4;

export const METIERS: { key: string; labelKey: string; emoji: string }[] = [
  { key: "plombier", labelKey: "metierPlombier", emoji: "🔧" }, { key: "electricien", labelKey: "metierElectricien", emoji: "⚡" },
  { key: "chauffagiste", labelKey: "metierChauffagiste", emoji: "🔥" }, { key: "climatiseur", labelKey: "metierClimatiseur", emoji: "❄️" },
  { key: "jardinier", labelKey: "metierJardinier", emoji: "🌿" }, { key: "cuisiniste", labelKey: "metierCuisiniste", emoji: "🍳" },
  { key: "menuisier", labelKey: "metierMenuisier", emoji: "🪑" }, { key: "peintre", labelKey: "metierPeintre", emoji: "🎨" },
  { key: "macon", labelKey: "metierMacon", emoji: "🏗️" }, { key: "terrassier", labelKey: "metierTerrassier", emoji: "🚜" },
  { key: "domotique", labelKey: "metierDomotique", emoji: "🔌" }, { key: "autre", labelKey: "metierAutre", emoji: "✏️" },
];

export const MODULES_PAR_METIER: Record<string, string[]> = {
  plombier: ["devis", "factures", "clients", "interventions", "stocks", "relances"],
  electricien: ["devis", "factures", "clients", "interventions", "signature", "relances"],
  chauffagiste: ["devis", "factures", "clients", "interventions", "contrats", "stocks"],
  climatiseur: ["devis", "factures", "clients", "interventions", "contrats"],
  jardinier: ["devis", "factures", "clients", "interventions", "rdv"],
  cuisiniste: ["devis", "factures", "clients", "commandes", "signature"],
  peintre: ["devis", "factures", "clients", "interventions", "signature"],
  macon: ["devis", "factures", "clients", "interventions", "stocks", "commandes"],
  menuisier: ["devis", "factures", "clients", "stocks", "commandes", "signature"],
  terrassier: ["devis", "factures", "clients", "interventions", "commandes"],
  domotique: ["devis", "factures", "clients", "interventions", "signature", "assistant_ia"],
  autre: ["devis", "factures", "clients", "interventions", "relances"],
};

/** Slugs recommandés pour un métier, restreints aux modules réellement disponibles. PUR. */
export function recommendedSlugs(metierKey: string, modules: readonly Module[]): Set<string> {
  const recos = MODULES_PAR_METIER[metierKey] || MODULES_PAR_METIER.autre;
  return new Set(recos.filter((slug) => modules.some((m) => m.slug === slug)));
}

/** Métier final (texte libre si « autre »). PUR. */
export function metierFinal(metierKey: string | null, metierAutre: string): string {
  if (metierKey === "autre") return metierAutre.trim() || "autre";
  return metierKey || "";
}

/** Payload de finalisation. PUR. */
export function buildCompletePayload(metier: string, slugs: ReadonlySet<string>): CompleteOnboardingInput {
  return { metier: metier || undefined, moduleSlugs: Array.from(slugs) };
}

/** Bascule un slug dans l'ensemble sélectionné (immutable). PUR. */
export function toggleSlug(slugs: ReadonlySet<string>, slug: string, on: boolean): Set<string> {
  const next = new Set(slugs);
  if (on) next.add(slug); else next.delete(slug);
  return next;
}
