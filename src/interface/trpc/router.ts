import { router, publicProcedure, protectedProcedure } from "./trpc";
import { createVehiculesRouter } from "../../modules/vehicules/interface/trpc/vehicules.router";
import type { IVehiculeRepository } from "../../modules/vehicules/application/vehicule-repository";
import type { AvisModule } from "../../modules/avis/avis.module";
import type { BadgesModule } from "../../modules/badges/badges.module";
import type { TechniciensModule } from "../../modules/techniciens/techniciens.module";
import type { NotificationsModule } from "../../modules/notifications/notifications.module";
import type { FournisseursModule } from "../../modules/fournisseurs/fournisseurs.module";
import type { CommandesModule } from "../../modules/commandes/commandes.module";
import type { StocksModule } from "../../modules/stocks/stocks.module";
import type { ClientsModule } from "../../modules/clients/clients.module";

export interface AppRouterDeps {
  readonly vehiculeRepo: IVehiculeRepository;
  // Modules déjà assemblés (router prêt) → découple la composition des détails du domaine.
  readonly avis: AvisModule;
  readonly badges: BadgesModule;
  readonly techniciens: TechniciensModule;
  readonly notifications: NotificationsModule;
  readonly fournisseurs: FournisseursModule;
  readonly commandes: CommandesModule;
  readonly stocks: StocksModule;
  readonly clients: ClientsModule;
}

// Routeur racine du nouveau stack. Les routeurs de domaines (phases 1-5) y sont montés
// au fur et à mesure, derrière le gateway/flag. `whoami` démontre `protectedProcedure`.
export function createAppRouter(deps: AppRouterDeps) {
  return router({
    health: publicProcedure.query(() => ({ status: "ok" as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({
      artisanId: ctx.tenant.artisanId,
      userId: ctx.tenant.userId,
      role: ctx.tenant.role ?? null,
    })),
    vehicules: createVehiculesRouter(deps.vehiculeRepo),
    avis: deps.avis.router,
    badges: deps.badges.router,
    techniciens: deps.techniciens.router,
    notifications: deps.notifications.router,
    fournisseurs: deps.fournisseurs.router,
    commandes: deps.commandes.router,
    stocks: deps.stocks.router,
    clients: deps.clients.router,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
