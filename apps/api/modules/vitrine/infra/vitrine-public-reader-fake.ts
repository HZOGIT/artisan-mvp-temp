import type { IVitrinePublicReader } from "../application/vitrine-public-reader";
import type { ArtisanVitrine, AvisPublic, VitrineParams, VitrinePublicStats } from "../domain/vitrine";

export interface VitrineFakeState {
  artisansBySlug?: Record<string, ArtisanVitrine>;
  params?: Record<number, VitrineParams>;
  avis?: Record<number, AvisPublic[]>;
  publicStats?: Record<number, VitrinePublicStats>;
  categories?: Record<number, string[]>;
}

// Fake en mémoire du lecteur public de vitrine (indexé par slug / artisanId).
export class VitrinePublicReaderFake implements IVitrinePublicReader {
  constructor(private readonly state: VitrineFakeState = {}) {}

  async getArtisanBySlug(slug: string): Promise<ArtisanVitrine | null> {
    return this.state.artisansBySlug?.[slug] ?? null;
  }
  async getVitrineParams(artisanId: number): Promise<VitrineParams | null> {
    return this.state.params?.[artisanId] ?? null;
  }
  async getPublishedAvis(artisanId: number): Promise<AvisPublic[]> {
    return this.state.avis?.[artisanId] ?? [];
  }
  async getPublicStats(artisanId: number): Promise<VitrinePublicStats> {
    return this.state.publicStats?.[artisanId] ?? { totalClients: 0, totalInterventions: 0 };
  }
  async getArticleCategories(artisanId: number): Promise<string[]> {
    return this.state.categories?.[artisanId] ?? [];
  }
}
