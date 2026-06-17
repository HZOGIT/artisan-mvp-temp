import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAINE de la feature `techniciens` (clean-archi) : types dérivés des sorties du routeur tRPC
// + règles PURES testables sans réseau ni i18n.

export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type LinkableUser = RouterOutputs["techniciens"]["getLinkableUsers"][number];
export type TechnicienStats = RouterOutputs["techniciens"]["getStats"];
export type Habilitation = RouterOutputs["techniciens"]["getHabilitations"][number];

export const STATUT_KEYS = ["actif", "inactif", "conge"] as const;
export type TechnicienStatut = (typeof STATUT_KEYS)[number];

// Garde/normalisation PURE du statut (défaut actif).
export function toTechnicienStatut(s: string | null | undefined): TechnicienStatut {
  return (STATUT_KEYS as readonly string[]).includes(s ?? "") ? (s as TechnicienStatut) : "actif";
}

// Date d'expiration valide d'une habilitation, ou null. PUR.
export function habilExpiry(h: Pick<Habilitation, "dateExpiration">): Date | null {
  if (!h.dateExpiration) return null;
  const d = new Date(h.dateExpiration);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type HabilBadgeVariant = "default" | "secondary" | "destructive" | "outline";
export type HabilBadge =
  | { key: "habilNoExpiry"; variant: "outline" }
  | { key: "habilExpired"; variant: "destructive" }
  | { key: "habilExpiresIn"; params: { n: number }; variant: "secondary" }
  | { key: "habilValid"; variant: "default" };

// Badge PUR d'une habilitation (l'UI mappe `key` → libellé i18n + `variant` → style). `now` injectable.
// Mêmes seuils que le legacy : pas d'expiration / expirée (<0j) / expire bientôt (<=60j) / valide.
export function habilitationBadge(
  h: Pick<Habilitation, "dateExpiration">,
  now: Date = new Date(),
): HabilBadge {
  const exp = habilExpiry(h);
  if (!exp) return { key: "habilNoExpiry", variant: "outline" };
  const joursRestants = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
  if (joursRestants < 0) return { key: "habilExpired", variant: "destructive" };
  if (joursRestants <= 60) return { key: "habilExpiresIn", params: { n: joursRestants }, variant: "secondary" };
  return { key: "habilValid", variant: "default" };
}
