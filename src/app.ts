import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createAppRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";
import { getDbHandle } from "./shared/db";
import { VehiculeRepositoryDrizzle } from "./modules/vehicules/infra/vehicule-repository-drizzle";
import type { IVehiculeRepository } from "./modules/vehicules/application/vehicule-repository";
import { AvisRepositoryDrizzle } from "./modules/avis/infra/avis-repository-drizzle";
import type { IAvisRepository } from "./modules/avis/application/avis-repository";
import { createAvisModule } from "./modules/avis/avis.module";
import { DemandeAvisRepositoryDrizzle } from "./modules/avis/infra/demande-avis-repository-drizzle";
import type { IDemandeAvisRepository } from "./modules/avis/application/demande-avis-repository";
import { createBadgesModule } from "./modules/badges/badges.module";
import { BadgeRepositoryDrizzle } from "./modules/badges/infra/badge-repository-drizzle";
import type { IBadgeRepository } from "./modules/badges/application/badge-repository";
import { createTechniciensModule } from "./modules/techniciens/techniciens.module";
import { TechnicienRepositoryDrizzle } from "./modules/techniciens/infra/technicien-repository-drizzle";
import type { ITechnicienRepository } from "./modules/techniciens/application/technicien-repository";
import { createNotificationsModule } from "./modules/notifications/notifications.module";
import { NotificationRepositoryDrizzle } from "./modules/notifications/infra/notification-repository-drizzle";
import type { INotificationRepository } from "./modules/notifications/application/notification-repository";
import { createFournisseursModule } from "./modules/fournisseurs/fournisseurs.module";
import { FournisseurRepositoryDrizzle } from "./modules/fournisseurs/infra/fournisseur-repository-drizzle";
import type { IFournisseurRepository } from "./modules/fournisseurs/application/fournisseur-repository";
import { createCommandesModule } from "./modules/commandes/commandes.module";
import { CommandeRepositoryDrizzle } from "./modules/commandes/infra/commande-repository-drizzle";
import type { ICommandeRepository } from "./modules/commandes/application/commande-repository";
import { createStocksModule } from "./modules/stocks/stocks.module";
import { StockRepositoryDrizzle } from "./modules/stocks/infra/stock-repository-drizzle";
import type { IStockRepository } from "./modules/stocks/application/stock-repository";
import { createClientsModule } from "./modules/clients/clients.module";
import { ClientRepositoryDrizzle } from "./modules/clients/infra/client-repository-drizzle";
import type { IClientRepository } from "./modules/clients/application/client-repository";
import type { EmailPort, RateLimiterPort } from "./shared/ports";
import { LegacyEmailAdapter, SlidingWindowRateLimiter } from "./shared/ports";

export interface AppDeps extends ContextDeps {
  // Repos injectables (tests). Par défaut, repos Drizzle sur le client par défaut
  // (APP_DATABASE_URL → rôle app non-superuser soumis à la RLS).
  readonly vehiculeRepo?: IVehiculeRepository;
  readonly avisRepo?: IAvisRepository;
  // Dépendances du workflow demande d'avis (injectables en test : email/rate-limiter fakes).
  readonly demandeAvisRepo?: IDemandeAvisRepository;
  readonly emailPort?: EmailPort;
  readonly rateLimiter?: RateLimiterPort;
  readonly lienBaseUrl?: string;
  readonly badgeRepo?: IBadgeRepository;
  readonly technicienRepo?: ITechnicienRepository;
  readonly notificationRepo?: INotificationRepository;
  readonly fournisseurRepo?: IFournisseurRepository;
  readonly commandeRepo?: ICommandeRepository;
  readonly stockRepo?: IStockRepository;
  readonly clientRepo?: IClientRepository;
}

// Construit l'instance Fastify du nouveau stack : /health + tRPC monté sur /api/trpc.
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);

  app.get("/health", async () => ({ status: "ok" }));

  const vehiculeRepo = deps.vehiculeRepo ?? new VehiculeRepositoryDrizzle(getDbHandle().db);
  const avis = createAvisModule({
    avisRepo: deps.avisRepo ?? new AvisRepositoryDrizzle(getDbHandle().db),
    demande: {
      repo: deps.demandeAvisRepo ?? new DemandeAvisRepositoryDrizzle(getDbHandle().db),
      email: deps.emailPort ?? new LegacyEmailAdapter(),
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(),
      lienBaseUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    },
  });
  const badges = createBadgesModule({
    repository: deps.badgeRepo ?? new BadgeRepositoryDrizzle(getDbHandle().db),
  });
  const techniciens = createTechniciensModule({
    repository: deps.technicienRepo ?? new TechnicienRepositoryDrizzle(getDbHandle().db),
  });
  const notifications = createNotificationsModule({
    repository: deps.notificationRepo ?? new NotificationRepositoryDrizzle(getDbHandle().db),
  });
  const fournisseurs = createFournisseursModule({
    repository: deps.fournisseurRepo ?? new FournisseurRepositoryDrizzle(getDbHandle().db),
  });
  const commandes = createCommandesModule({
    repository: deps.commandeRepo ?? new CommandeRepositoryDrizzle(getDbHandle().db),
  });
  const stocks = createStocksModule({
    repository: deps.stockRepo ?? new StockRepositoryDrizzle(getDbHandle().db),
  });
  const clients = createClientsModule({
    repository: deps.clientRepo ?? new ClientRepositoryDrizzle(getDbHandle().db),
  });
  const appRouter = createAppRouter({ vehiculeRepo, avis, badges, techniciens, notifications, fournisseurs, commandes, stocks, clients });

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: makeCreateContext({ jwtSecret: deps.jwtSecret, resolver: deps.resolver }),
    },
  });

  return app;
}
