import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { PublicArticleSearchReader } from "../../modules/articles/application/public-article-search";
import { isSearchable } from "../../modules/articles/application/public-article-search";
import { extractClientIp } from "./client-ip";

export interface ArticlesSearchDeps {
  readonly reader: PublicArticleSearchReader;
  readonly rateLimiter: RateLimiterPort;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

// Route PUBLIQUE hors tRPC `GET /api/articles/search` : autocomplete du catalogue de référence
// (`bibliotheque_articles`, global). Aucune auth (catalogue public) ; rate-limit IP (anti-scraping).
// `q` < 2 caractères → `[]` (parité legacy). Filtres optionnels métier/catégorie/sous-catégorie.
export function registerArticlesSearchRoute(app: FastifyInstance, deps: ArticlesSearchDeps): void {
  app.get("/api/articles/search", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`articles-search:${ip}`))) {
      return reply.code(429).send({ error: "Trop de requêtes, réessayez dans une minute" });
    }
    const q = (req.query as { q?: unknown } | undefined)?.q;
    const query = typeof q === "string" ? q.trim() : "";
    if (!isSearchable(query)) return reply.send([]);

    const f = (req.query ?? {}) as Record<string, unknown>;
    const rows = await deps.reader.search(query, { metier: str(f.metier), categorie: str(f.categorie), sousCategorie: str(f.sous_categorie) });
    return reply.send(rows);
  });
}
