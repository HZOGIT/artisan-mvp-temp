import type { ArtisanVitrine, AvisPublic, VitrineParams, VitrinePublicStats } from "../domain/vitrine";

// Port de lecture publique de la vitrine. `getArtisanBySlug` lit la table `artisans` (HORS RLS) ; les
// autres méthodes lisent les données du tenant résolu (parametres/avis/clients/interventions/articles,
// SOUS RLS) sous le scope de CET artisan (le slug est la capacité publique → lecture légitime).
export interface IVitrinePublicReader {
  getArtisanBySlug(slug: string): Promise<ArtisanVitrine | null>;
  getVitrineParams(artisanId: number): Promise<VitrineParams | null>;
  getPublishedAvis(artisanId: number): Promise<AvisPublic[]>;
  getPublicStats(artisanId: number): Promise<VitrinePublicStats>;
  getArticleCategories(artisanId: number): Promise<string[]>;
}
