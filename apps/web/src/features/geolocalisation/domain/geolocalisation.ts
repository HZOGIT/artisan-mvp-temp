import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `geolocalisation` (suivi temps réel des techniciens). Types dérivés du routeur,
 * constructeurs HTML PURS pour les marqueurs/popups Leaflet (testables) + helpers. 0 React, 0 Leaflet.
 */

export type Tech = RouterOutputs["geolocalisation"]["getPositions"][number];
export type Position = NonNullable<Tech["position"]>;
export type TechWithPos = Tech & { position: Position };

/** Identité stable d'un technicien positionné (le DTO porte `technicienId` sur la position). PUR. */
export function techId(t: TechWithPos): number {
  return t.position.technicienId;
}

/** Techniciens ayant une position connue. PUR. */
export function withPosition(techs: readonly Tech[]): TechWithPos[] {
  return techs.filter((t): t is TechWithPos => t.position !== null);
}

/** Coordonnées numériques [lat, lng]. PUR. */
export function latLng(p: Position): [number, number] {
  return [parseFloat(p.latitude), parseFloat(p.longitude)];
}

/** Couleur de texte du niveau de batterie. PUR. */
export function batterieColor(niveau: number | null): string {
  if (!niveau) return "text-gray-400";
  if (niveau > 50) return "text-green-500";
  if (niveau > 20) return "text-yellow-500";
  return "text-red-500";
}

/** HTML de l'icône de marqueur (pastille colorée + pictogramme + point « en déplacement »). PUR. */
export function markerIconHtml(couleur: string, enDeplacement: boolean | null): string {
  const dot = enDeplacement
    ? `<div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;background-color:#22c55e;border-radius:50%;border:2px solid white;"></div>`
    : "";
  return `<div style="background-color:${couleur};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;position:relative;"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>${dot}</div>`;
}

/** Libellés i18n injectés par l'UI (les popups Leaflet sont du HTML impératif, hors react-i18next). */
export type PopupLabels = { maj: string; batterie: string; vitesse: string; enDeplacement: string; stationnaire: string };

/** HTML du contenu de popup d'un technicien. `heure` (déjà formatée) et `labels` injectés par l'UI. PUR. */
export function popupContentHtml(tech: TechWithPos, heure: string, labels: PopupLabels): string {
  const p = tech.position;
  const nom = `${tech.nom}${tech.prenom ? " " + tech.prenom : ""}`;
  const vitesse = p.vitesse !== null && parseFloat(p.vitesse) > 0 ? `<p>🚗 ${labels.vitesse}: ${parseFloat(p.vitesse).toFixed(0)} km/h</p>` : "";
  const batterie = p.batterie ? `<p>🔋 ${labels.batterie}: ${p.batterie}%</p>` : "";
  const specialite = tech.specialite ? `<p style="color:#666;font-size:12px;margin:4px 0;">${tech.specialite}</p>` : "";
  const statut = p.enDeplacement
    ? `<span style="color:#22c55e;">● ${labels.enDeplacement}</span>`
    : `<span style="color:#6b7280;">● ${labels.stationnaire}</span>`;
  return `<div style="padding:8px;min-width:200px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><div style="width:12px;height:12px;border-radius:50%;background-color:${tech.couleur || "#3B82F6"};"></div><strong style="font-size:14px;">${nom}</strong></div>${specialite}<div style="font-size:12px;color:#666;margin-top:8px;"><p>📍 ${parseFloat(p.latitude).toFixed(6)}, ${parseFloat(p.longitude).toFixed(6)}</p><p>🕐 ${labels.maj}: ${heure}</p>${batterie}${vitesse}<p style="margin-top:4px;">${statut}</p></div></div>`;
}
