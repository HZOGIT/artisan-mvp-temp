// Domaine du site vitrine public de l'artisan (parité legacy `vitrine`). La page est consultée par
// SLUG (capacité publique, sans cookie) ; l'artisan est résolu depuis la table `artisans` (HORS RLS),
// puis ses données publiques sont lues sous son propre scope tenant.

export interface ArtisanVitrine {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly specialite: string | null;
  readonly telephone: string | null;
  readonly email: string | null;
  readonly ville: string | null;
  readonly codePostal: string | null;
  readonly adresse: string | null;
  readonly siret: string | null;
  readonly logo: string | null;
}

export interface VitrineParams {
  readonly vitrineActive: boolean | null;
  readonly vitrineDescription: string | null;
  readonly vitrineZone: string | null;
  readonly vitrineServices: string | null; // JSON string (legacy) — parsé par la couche domaine
  readonly vitrineExperience: number | null;
}

export interface AvisPublic {
  readonly id: number;
  readonly note: number;
  readonly commentaire: string | null;
  readonly reponseArtisan: string | null;
  readonly reponseAt: Date | null;
  readonly createdAt: Date;
  readonly clientNom: string;
}

export interface AvisStats {
  readonly moyenne: number;
  readonly total: number;
  readonly distribution: Record<number, number>;
}

export interface VitrinePublicStats {
  readonly totalClients: number;
  readonly totalInterventions: number;
}

// Stats des avis publiés (moyenne arrondie au dixième + distribution 1..5). PUR (parité legacy
// `getPublishedAvisStats`, calculé depuis les avis déjà chargés plutôt qu'une 2ᵉ requête).
export function computeAvisStats(avis: readonly AvisPublic[]): AvisStats {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const a of avis) {
    sum += a.note;
    distribution[a.note] = (distribution[a.note] || 0) + 1;
  }
  const total = avis.length;
  return { moyenne: total > 0 ? Math.round((sum / total) * 10) / 10 : 0, total, distribution };
}

// Liste des services : JSON `vitrineServices` s'il est non vide, sinon repli sur les catégories
// d'articles (parité legacy). PUR. JSON invalide → [].
export function resoudreServices(vitrineServices: string | null, categories: readonly string[]): string[] {
  let services: string[] = [];
  try {
    services = vitrineServices ? (JSON.parse(vitrineServices) as string[]) : [];
  } catch {
    services = [];
  }
  return services.length > 0 ? services : [...categories];
}

// Échappe le HTML inséré dans le corps de l'email de contact (anti-injection). Parité legacy `safeHtml`.
export function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
