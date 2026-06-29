import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { SuperPdpPaAdapter } from "../../shared/ports/superpdp-pa-adapter";
import { verifyAuthToken, type TenantResolver } from "../../shared/tenant";
import { artisans } from "../../../../drizzle/schema/artisans";
import { eq } from "drizzle-orm";
import type { DbClient } from "../../shared/db";

const STATE_COOKIE = "superpdp_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface SuperpdpOauthDeps {
  readonly adapter: SuperPdpPaAdapter;
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly jwtSecret: string;
  readonly resolver: TenantResolver;
  readonly db: DbClient;
}

/**
 * Initiation OAuth2 `authorization_code` SuperPDP.
 * Redirige l'artisan vers SuperPDP avec son SIREN + un state CSRF.
 * Route : `GET /api/einvoicing/oauth/authorize`
 */
export function registerSuperpdpOauthRoutes(app: FastifyInstance, deps: SuperpdpOauthDeps): void {
  app.register((instance) => {
    instance.get("/api/einvoicing/oauth/authorize", async (req, reply) => {
      const claims = await verifyAuthToken(
        (req.cookies as Record<string, string | undefined>).token ?? null,
        deps.jwtSecret,
      );
      if (!claims) return reply.code(401).send({ error: "non authentifié" });

      const tenant = await deps.resolver.resolve(claims);
      if (!tenant) return reply.code(403).send({ error: "artisan non trouvé" });

      const [artisan] = await deps.db
        .select({ siret: artisans.siret })
        .from(artisans)
        .where(eq(artisans.id, tenant.artisanId))
        .limit(1);

      if (!artisan?.siret || artisan.siret.length < 9) {
        return reply.code(422).send({ error: "SIRET manquant ou invalide — complétez votre profil" });
      }

      const siren = artisan.siret.slice(0, 9);
      const state = randomBytes(16).toString("hex");

      reply.setCookie(STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: STATE_TTL_MS / 1000,
        path: "/api/einvoicing/oauth",
      });

      const params = new URLSearchParams({
        response_type: "code",
        client_id: deps.clientId,
        redirect_uri: deps.redirectUri,
        state,
        superpdp_company_number: siren,
        superpdp_company_number_scheme: "fr_siren",
      });

      return reply.redirect(`${deps.baseUrl}/oauth2/authorize?${params.toString()}`);
    });

    instance.get("/api/einvoicing/oauth/callback", async (req, reply) => {
      const { code, state, error } = req.query as Record<string, string | undefined>;

      if (error) return reply.code(400).send({ error });

      const cookieState = (req.cookies as Record<string, string | undefined>)[STATE_COOKIE];
      if (!cookieState || cookieState !== state) {
        return reply.code(400).send({ error: "state CSRF invalide" });
      }

      reply.clearCookie(STATE_COOKIE, { path: "/api/einvoicing/oauth" });

      if (!code) return reply.code(400).send({ error: "code manquant" });

      const claims = await verifyAuthToken(
        (req.cookies as Record<string, string | undefined>).token ?? null,
        deps.jwtSecret,
      );
      if (!claims) return reply.code(401).send({ error: "non authentifié" });

      const tenant = await deps.resolver.resolve(claims);
      if (!tenant) return reply.code(403).send({ error: "artisan non trouvé" });

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        redirect_uri: deps.redirectUri,
      });

      const tokenRes = await fetch(`${deps.baseUrl}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        req.log.error({ event: "superpdp_oauth_token_error", status: tokenRes.status }, "échange code→token échoué");
        return reply.code(502).send({ error: "échange de token échoué" });
      }

      const json = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      await deps.adapter.upsertToken(tenant.artisanId, {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt: new Date(Date.now() + json.expires_in * 1000),
      });

      req.log.info({ event: "superpdp_oauth_connected", artisanId: tenant.artisanId }, "SuperPDP connecté");

      /* Redirige vers la page paramètres avec indicateur succès */
      return reply.redirect("/parametres?superpdp=connected");
    });
  });
}
