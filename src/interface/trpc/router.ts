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
import type { InterventionsModule } from "../../modules/interventions/interventions.module";
import type { CongesModule } from "../../modules/conges/conges.module";
import type { NotesDeFraisModule } from "../../modules/notes-de-frais/notes-de-frais.module";
import type { ChantiersModule } from "../../modules/chantiers/chantiers.module";
import type { DepensesModule } from "../../modules/depenses/depenses.module";
import type { DevisModule } from "../../modules/devis/devis.module";
import type { FacturesModule } from "../../modules/factures/factures.module";
import type { EcrituresModule } from "../../modules/ecritures/ecritures.module";
import type { ArticlesModule } from "../../modules/articles/articles.module";
import type { ParametresModule } from "../../modules/parametres/parametres.module";
import type { ModelesEmailModule } from "../../modules/modeles-email/modeles-email.module";
import type { ModelesDevisModule } from "../../modules/modeles-devis/modeles-devis.module";
import type { ConfigRelancesModule } from "../../modules/config-relances/config-relances.module";
import type { RdvEnLigneModule } from "../../modules/rdv-en-ligne/rdv-en-ligne.module";
import type { RelancesDevisModule } from "../../modules/relances-devis/relances-devis.module";
import type { CategoriesDepensesModule } from "../../modules/categories-depenses/categories-depenses.module";
import type { ContratsMaintenanceModule } from "../../modules/contrats-maintenance/contrats-maintenance.module";
import type { DemandesContactModule } from "../../modules/demandes-contact/demandes-contact.module";
import type { BudgetsCategoriesModule } from "../../modules/budgets-categories/budgets-categories.module";
import type { ReglesCategorisationModule } from "../../modules/regles-categorisation/regles-categorisation.module";
import type { PrevisionsCAModule } from "../../modules/previsions-ca/previsions-ca.module";

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
  readonly interventions: InterventionsModule;
  readonly conges: CongesModule;
  readonly notesDeFrais: NotesDeFraisModule;
  readonly chantiers: ChantiersModule;
  readonly depenses: DepensesModule;
  readonly devis: DevisModule;
  readonly factures: FacturesModule;
  readonly ecritures: EcrituresModule;
  readonly articles: ArticlesModule;
  readonly parametres: ParametresModule;
  readonly modelesEmail: ModelesEmailModule;
  readonly modelesDevis: ModelesDevisModule;
  readonly configRelances: ConfigRelancesModule;
  readonly rdvEnLigne: RdvEnLigneModule;
  readonly relancesDevis: RelancesDevisModule;
  readonly categoriesDepenses: CategoriesDepensesModule;
  readonly contratsMaintenance: ContratsMaintenanceModule;
  readonly demandesContact: DemandesContactModule;
  readonly budgetsCategories: BudgetsCategoriesModule;
  readonly reglesCategorisation: ReglesCategorisationModule;
  readonly previsionsCA: PrevisionsCAModule;
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
    commandesFournisseurs: deps.commandes.router,
    stocks: deps.stocks.router,
    clients: deps.clients.router,
    interventions: deps.interventions.router,
    conges: deps.conges.router,
    notesDeFrais: deps.notesDeFrais.router,
    chantiers: deps.chantiers.router,
    depenses: deps.depenses.router,
    devis: deps.devis.router,
    factures: deps.factures.router,
    ecritures: deps.ecritures.router,
    articles: deps.articles.router,
    parametres: deps.parametres.router,
    modelesEmail: deps.modelesEmail.router,
    modelesDevis: deps.modelesDevis.router,
    configRelances: deps.configRelances.router,
    rdv: deps.rdvEnLigne.router,
    relances: deps.relancesDevis.router,
    categoriesDepenses: deps.categoriesDepenses.router,
    contrats: deps.contratsMaintenance.router,
    demandesContact: deps.demandesContact.router,
    budgetsCategories: deps.budgetsCategories.router,
    reglesCategorisation: deps.reglesCategorisation.router,
    previsions: deps.previsionsCA.router,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
