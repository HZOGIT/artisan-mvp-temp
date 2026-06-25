import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { buildFastifyLoggerConfig } from "./shared/ports/logger-fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createAppRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";
import { getDbHandle } from "./shared/db";
import { DrizzleTenantResolver } from "./shared/tenant/drizzle-tenant-resolver";
import { DrizzleUserRoleReader } from "./shared/tenant/role-reader";
import { DrizzlePermissionsReader } from "./shared/tenant/permissions-reader";
import { VehiculeRepositoryDrizzle } from "./modules/vehicules/infra/vehicule-repository-drizzle";
import type { IVehiculeRepository } from "./modules/vehicules/application/vehicule-repository";
import { AvisRepositoryDrizzle } from "./modules/avis/infra/avis-repository-drizzle";
import type { IAvisRepository } from "./modules/avis/application/avis-repository";
import { createAvisModule } from "./modules/avis/avis.module";
import { DemandeAvisRepositoryDrizzle } from "./modules/avis/infra/demande-avis-repository-drizzle";
import type { IDemandeAvisRepository } from "./modules/avis/application/demande-avis-repository";
import { PublicDemandeAvisReaderDrizzle } from "./modules/avis/infra/public-demande-reader-drizzle";
import { PublicDemandeContextReaderDrizzle } from "./modules/avis/infra/public-demande-context-reader-drizzle";
import { PublicAvisWriterDrizzle } from "./modules/avis/infra/public-avis-writer-drizzle";
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
import { ArtisanReaderDrizzle as CommandeArtisanReaderDrizzle } from "./modules/commandes/infra/artisan-reader-drizzle";
import type { ICommandeRepository } from "./modules/commandes/application/commande-repository";
import { createStocksModule } from "./modules/stocks/stocks.module";
import { StockRepositoryDrizzle } from "./modules/stocks/infra/stock-repository-drizzle";
import type { IStockRepository } from "./modules/stocks/application/stock-repository";
import { createClientsModule } from "./modules/clients/clients.module";
import { ClientRepositoryDrizzle } from "./modules/clients/infra/client-repository-drizzle";
import type { IClientRepository } from "./modules/clients/application/client-repository";
import { createInterventionsModule } from "./modules/interventions/interventions.module";
import { InterventionRepositoryDrizzle } from "./modules/interventions/infra/intervention-repository-drizzle";
import type { IInterventionRepository } from "./modules/interventions/application/intervention-repository";
import { createCongesModule } from "./modules/conges/conges.module";
import { CongeRepositoryDrizzle } from "./modules/conges/infra/conge-repository-drizzle";
import type { ICongeRepository } from "./modules/conges/application/conge-repository";
import { createNotesDeFraisModule } from "./modules/notes-de-frais/notes-de-frais.module";
import { NoteDeFraisRepositoryDrizzle } from "./modules/notes-de-frais/infra/note-de-frais-repository-drizzle";
import type { INoteDeFraisRepository } from "./modules/notes-de-frais/application/note-de-frais-repository";
import { createChantiersModule } from "./modules/chantiers/chantiers.module";
import { ChantierRepositoryDrizzle } from "./modules/chantiers/infra/chantier-repository-drizzle";
import type { IChantierRepository } from "./modules/chantiers/application/chantier-repository";
import { createDepensesModule } from "./modules/depenses/depenses.module";
import { TransactionBancaireRepositoryDrizzle } from "./modules/depenses/infra/transaction-bancaire-repository-drizzle";
import type { ITransactionBancaireRepository } from "./modules/depenses/application/transaction-bancaire-repository";
import { FecReaderDrizzle } from "./modules/depenses/infra/fec-reader-drizzle";
import type { FecReader } from "./modules/depenses/application/fec-reader";
import { createArtisanModule } from "./modules/artisan/artisan.module";
import { ArtisanRepositoryDrizzle } from "./modules/artisan/infra/artisan-repository-drizzle";
import type { IArtisanRepository } from "./modules/artisan/application/artisan-repository";
import { createDevisOptionsModule } from "./modules/devis-options/devis-options.module";
import { DevisOptionRepositoryDrizzle } from "./modules/devis-options/infra/devis-option-repository-drizzle";
import type { IDevisOptionRepository } from "./modules/devis-options/application/devis-option-repository";
import { createActivitesModule } from "./modules/activites/activites.module";
import { ActiviteRepositoryDrizzle } from "./modules/activites/infra/activite-repository-drizzle";
import type { IActiviteRepository } from "./modules/activites/application/activite-repository";
import { createFeatureModulesModule } from "./modules/feature-modules/feature-modules.module";
import { ModulesRepositoryDrizzle } from "./modules/feature-modules/infra/modules-repository-drizzle";
import type { IModulesRepository } from "./modules/feature-modules/application/modules-repository";
import { createStatistiquesModule } from "./modules/statistiques/statistiques.module";
import { DevisStatsReaderDrizzle } from "./modules/statistiques/infra/devis-stats-reader-drizzle";
import type { IDevisStatsReader } from "./modules/statistiques/application/devis-stats-reader";
import { createCalendrierModule } from "./modules/calendrier/calendrier.module";
import { IcalFeedRepositoryDrizzle } from "./modules/calendrier/infra/ical-feed-repository-drizzle";
import type { IIcalFeedRepository } from "./modules/calendrier/application/ical-feed-repository";
import { createEmailsModule } from "./modules/emails/emails.module";
import { EmailLogReaderDrizzle } from "./modules/emails/infra/email-log-reader-drizzle";
import type { IEmailLogReader } from "./modules/emails/application/email-log-reader";
import { createSearchModule } from "./modules/search/search.module";
import { SearchReaderDrizzle } from "./modules/search/infra/search-reader-drizzle";
import type { ISearchReader } from "./modules/search/application/search-reader";
import { createGeolocalisationModule } from "./modules/geolocalisation/geolocalisation.module";
import { TechnicienPositionReaderDrizzle } from "./modules/geolocalisation/infra/position-reader-drizzle";
import type { ITechnicienPositionReader } from "./modules/geolocalisation/application/position-reader";
import { createDashboardModule } from "./modules/dashboard/dashboard.module";
import { DashboardReaderDrizzle } from "./modules/dashboard/infra/dashboard-reader-drizzle";
import type { IDashboardReader } from "./modules/dashboard/application/dashboard-reader";
import { createRapportsModule } from "./modules/rapports/rapports.module";
import { RapportRepositoryDrizzle } from "./modules/rapports/infra/rapport-repository-drizzle";
import type { IRapportRepository } from "./modules/rapports/application/rapport-repository";
import { createUtilisateursModule } from "./modules/utilisateurs/utilisateurs.module";
import { UtilisateurRepositoryDrizzle } from "./modules/utilisateurs/infra/utilisateur-repository-drizzle";
import type { IUtilisateurRepository } from "./modules/utilisateurs/application/utilisateur-repository";
import { BcryptPasswordHasher } from "./shared/ports/password-hasher-bcrypt";
import { createComptabiliteModule } from "./modules/comptabilite/comptabilite.module";
import { ComptabiliteReaderDrizzle } from "./modules/comptabilite/infra/comptabilite-reader-drizzle";
import type { IComptabiliteReader } from "./modules/comptabilite/application/comptabilite-reader";
import { createAuthModule } from "./modules/auth/auth.module";
import { AuthRepositoryDrizzle } from "./modules/auth/infra/auth-repository-drizzle";
import type { IAuthRepository } from "./modules/auth/application/auth-repository";
import { createSubscriptionModule } from "./modules/subscription/subscription.module";
import { createBillingModule } from "./modules/billing/billing.module";
import { BillingRepositoryDrizzle } from "./modules/billing/infra/billing-repository-drizzle";
import { BillingAdapter } from "./shared/ports/billing-adapter";
import { SubscriptionReaderDrizzle } from "./modules/subscription/infra/subscription-reader-drizzle";
import type { ISubscriptionRepository } from "./modules/subscription/application/subscription-reader";
import { StripeAdapter } from "./shared/ports/stripe-adapter";
import type { StripePort } from "./shared/ports/stripe";
import { createSignatureModule } from "./modules/signature/signature.module";
import { SignatureRepositoryDrizzle } from "./modules/signature/infra/signature-repository-drizzle";
import { SignatureContextReaderDrizzle, SignatureNotificationWriterDrizzle } from "./modules/signature/infra/signature-context-reader-drizzle";
import { SignaturePublicReaderDrizzle } from "./modules/signature/infra/signature-public-reader-drizzle";
import { SignaturePublicWriterDrizzle } from "./modules/signature/infra/signature-public-writer-drizzle";
import { createConseilsIaModule } from "./modules/conseils-ia/conseils-ia.module";
import { ConseilsStatsReaderDrizzle } from "./modules/conseils-ia/infra/conseils-stats-reader-drizzle";
import { createAssistantModule } from "./modules/assistant/assistant.module";
import { AssistantThreadsRepositoryDrizzle } from "./modules/assistant/infra/assistant-threads-repository-drizzle";
import { AssistantDataReaderDrizzle } from "./modules/assistant/infra/assistant-data-reader-drizzle";
import { createChatModule } from "./modules/chat/chat.module";
import { createSupportModule } from "./modules/support/support.module";
import { createDevicesModule } from "./modules/devices/devices.module";
import { DeviceRepositoryDrizzle } from "./modules/devices/infra/device-repository-drizzle";
import { createAlertesPrevisionsModule } from "./modules/alertes-previsions/alertes-previsions.module";
import { AlertesPrevisionsRepositoryDrizzle } from "./modules/alertes-previsions/infra/alertes-previsions-repository-drizzle";
import { createImportErpModule } from "./modules/import-erp/import-erp.module";
import { ImportErpRepositoryDrizzle } from "./modules/import-erp/infra/import-erp-repository-drizzle";
import { createInterventionsMobileModule } from "./modules/interventions-mobile/interventions-mobile.module";
import { InterventionMobileRepositoryDrizzle } from "./modules/interventions-mobile/infra/intervention-mobile-repository-drizzle";
import { createVitrineModule } from "./modules/vitrine/vitrine.module";
import { VitrinePublicReaderDrizzle } from "./modules/vitrine/infra/vitrine-public-reader-drizzle";
import { VitrineSettingsRepositoryDrizzle } from "./modules/vitrine/infra/vitrine-settings-repository-drizzle";
import { createClientPortalModule } from "./modules/client-portal/client-portal.module";
import { PortalAccessRepositoryDrizzle } from "./modules/client-portal/infra/portal-access-repository-drizzle";
import { PortalDocsReaderDrizzle } from "./modules/client-portal/infra/portal-docs-reader-drizzle";
import { PortalSchedulingReaderDrizzle } from "./modules/client-portal/infra/portal-scheduling-reader-drizzle";
import { createIntegrationsComptablesModule } from "./modules/integrations-comptables/integrations-comptables.module";
import { IntegrationsComptablesRepositoryDrizzle } from "./modules/integrations-comptables/infra/integrations-comptables-repository-drizzle";
import { getFecExport } from "./modules/comptabilite/application/use-cases";
import { createDevisIAModule } from "./modules/devis-ia/devis-ia.module";
import { DevisIARepositoryDrizzle } from "./modules/devis-ia/infra/devis-ia-repository-drizzle";
import { ChatRepositoryDrizzle } from "./modules/chat/infra/chat-repository-drizzle";
import { ChatClientNotifierDrizzle } from "./modules/chat/infra/chat-client-notifier-drizzle";
import { registerIcalRoute } from "./interface/http/ical-route";
import { IcalPublicReaderDrizzle } from "./modules/calendrier/infra/ical-public-reader-drizzle";
import { registerStripeWebhookRoute } from "./interface/http/stripe-webhook-route";
import { registerBillingSchedulerRoute } from "./interface/http/billing-scheduler-route";
import { handleBillingWebhookEvent } from "./modules/billing/interface/http/billing-webhook-handler";
import fastifySchedule from "@fastify/schedule";
import { billingCronPlugin } from "./shared/infra/billing-cron";
import { ensureStripeWebhookEndpoint } from "./shared/infra/stripe-webhook-setup";
import { WebhookPaymentWriterDrizzle } from "./modules/subscription/infra/webhook-payment-writer-drizzle";
import { SubscriptionEventNotifierDrizzle } from "./modules/subscription/infra/subscription-event-notifier-drizzle";
import { registerUploadLogoRoute } from "./interface/http/upload-logo-route";
import { ArtisanLogoWriterDrizzle } from "./modules/artisan/infra/artisan-logo-writer-drizzle";
import { registerComptabiliteExportRoute } from "./interface/http/comptabilite-export-route";
import { FacturesCsvReaderDrizzle } from "./modules/comptabilite/infra/factures-csv-reader-drizzle";
import { registerPaiementRoute } from "./interface/http/paiement-route";
import { PortalPaymentReaderDrizzle } from "./modules/paiement/infra/portal-payment-reader-drizzle";
import { PortalPaymentWriterDrizzle } from "./modules/paiement/infra/portal-payment-writer-drizzle";
import { registerArticlesSearchRoute } from "./interface/http/articles-search-route";
import { PublicArticleSearchReaderDrizzle } from "./modules/articles/infra/public-article-search-drizzle";
import { registerAssistantAgentRoute } from "./interface/http/assistant-agent-route";
import { registerVoiceToolRoute } from "./interface/http/voice-tool-route";
import { registerVoiceTokenRoute } from "./interface/http/voice-token-route";
import { registerCommandePdfRoute } from "./interface/http/commande-pdf-route";
import { registerContratPdfRoute } from "./interface/http/contrat-pdf-route";
import { registerInterventionPdfRoute } from "./interface/http/intervention-pdf-route";
import { registerPortailDevisPdfRoute } from "./interface/http/portail-devis-pdf-route";
import { registerPortailFacturePdfRoute } from "./interface/http/portail-facture-pdf-route";
import { registerFacturxRoutes } from "./interface/http/facturx-route";
import { registerExportLotRoutes } from "./interface/http/export-lot-route";
import { registerFontsRoute } from "./interface/http/fonts-route";
import { registerVoiceDebugRoute } from "./interface/http/voice-debug-route";
import { getParametres } from "./modules/parametres/application/read-use-cases";
import { GeminiRealtimeVoiceTokenAdapter } from "./modules/assistant/infra/gemini-realtime-voice-token-adapter";
import { buildAssistantAgentRegistry, buildAssistantWriteHandlersFromRepos } from "./modules/assistant/infra/agent-wiring";
import { GeminiAgenticAdapter } from "./modules/assistant/infra/gemini-agentic-adapter";
import type { LlmAgenticPort } from "./modules/assistant/application/agentic-port";
import { AssistantThreadWriterDrizzle } from "./modules/assistant/infra/assistant-thread-writer-drizzle";
import { registerVoiceRoute } from "./interface/http/voice-route";
import { ConseilsStatsReaderDrizzle as AssistantStatsReaderDrizzle } from "./modules/conseils-ia/infra/conseils-stats-reader-drizzle";
import { DepenseRepositoryDrizzle } from "./modules/depenses/infra/depense-repository-drizzle";
import type { IDepenseRepository } from "./modules/depenses/application/depense-repository";
import { createDevisModule } from "./modules/devis/devis.module";
import { DevisRepositoryDrizzle } from "./modules/devis/infra/devis-repository-drizzle";
import { FacturesDevisToFactureConverter } from "./modules/devis/infra/factures-devis-to-facture-converter";
import {
  ArtisanReaderDrizzle as SharedArtisanReaderDrizzle,
  ClientReaderDrizzle as SharedClientReaderDrizzle,
} from "./shared/readers/contact-readers-drizzle";
import { DevisSignatureReaderDrizzle } from "./modules/devis/infra/devis-signature-reader-drizzle";
import type { IDevisRepository } from "./modules/devis/application/devis-repository";
import { createFacturesModule } from "./modules/factures/factures.module";
import { FactureRepositoryDrizzle } from "./modules/factures/infra/facture-repository-drizzle";
import { DevisReaderDrizzle } from "./modules/factures/infra/devis-reader-drizzle";
import { ArtisanReaderDrizzle } from "./modules/factures/infra/artisan-reader-drizzle";
import { ClientReaderDrizzle } from "./modules/factures/infra/client-reader-drizzle";
import type { IFactureRepository } from "./modules/factures/application/facture-repository";
import type { IDevisReader } from "./modules/factures/application/devis-reader";
import type { ComptaPort } from "./modules/factures/application/compta-port";
import { EcritureRepositoryDrizzle } from "./modules/ecritures/infra/ecriture-repository-drizzle";
import { FactureReaderDrizzle } from "./modules/ecritures/infra/facture-reader-drizzle";
import { ComptaEcrituresAdapter } from "./modules/ecritures/infra/compta-ecritures-adapter";
import { createEcrituresModule } from "./modules/ecritures/ecritures.module";
import type { IEcritureRepository } from "./modules/ecritures/application/ecriture-repository";
import { createArticlesModule } from "./modules/articles/articles.module";
import { BibliothequeReaderDrizzle } from "./modules/articles/infra/bibliotheque-reader-drizzle";
import { BibliothequeWriterDrizzle } from "./modules/articles/infra/bibliotheque-writer-drizzle";
import type { BibliothequeReader } from "./modules/articles/application/bibliotheque-reader";
import type { BibliothequeWriter } from "./modules/articles/application/bibliotheque-writer";
import { ArticleRepositoryDrizzle } from "./modules/articles/infra/article-repository-drizzle";
import type { IArticleRepository } from "./modules/articles/application/article-repository";
import { createParametresModule } from "./modules/parametres/parametres.module";
import { ParametresRepositoryDrizzle } from "./modules/parametres/infra/parametres-repository-drizzle";
import type { IParametresRepository } from "./modules/parametres/application/parametres-repository";
import { createModelesEmailModule } from "./modules/modeles-email/modeles-email.module";
import { ModeleEmailRepositoryDrizzle } from "./modules/modeles-email/infra/modele-email-repository-drizzle";
import type { IModeleEmailRepository } from "./modules/modeles-email/application/modele-email-repository";
import { createModelesDevisModule } from "./modules/modeles-devis/modeles-devis.module";
import { ModeleDevisRepositoryDrizzle } from "./modules/modeles-devis/infra/modele-devis-repository-drizzle";
import type { IModeleDevisRepository } from "./modules/modeles-devis/application/modele-devis-repository";
import { createConfigRelancesModule } from "./modules/config-relances/config-relances.module";
import { ConfigRelancesRepositoryDrizzle } from "./modules/config-relances/infra/config-relances-repository-drizzle";
import type { IConfigRelancesRepository } from "./modules/config-relances/application/config-relances-repository";
import { createRdvEnLigneModule } from "./modules/rdv-en-ligne/rdv-en-ligne.module";
import { RdvRepositoryDrizzle } from "./modules/rdv-en-ligne/infra/rdv-repository-drizzle";
import type { IRdvRepository } from "./modules/rdv-en-ligne/application/rdv-repository";
import { createRelancesDevisModule } from "./modules/relances-devis/relances-devis.module";
import { RelanceDevisRepositoryDrizzle } from "./modules/relances-devis/infra/relance-devis-repository-drizzle";
import type { IRelanceDevisRepository } from "./modules/relances-devis/application/relance-devis-repository";
import { createCategoriesDepensesModule } from "./modules/categories-depenses/categories-depenses.module";
import { CategorieDepenseRepositoryDrizzle } from "./modules/categories-depenses/infra/categorie-depense-repository-drizzle";
import type { ICategorieDepenseRepository } from "./modules/categories-depenses/application/categorie-depense-repository";
import { createContratsMaintenanceModule } from "./modules/contrats-maintenance/contrats-maintenance.module";
import { ContratRepositoryDrizzle } from "./modules/contrats-maintenance/infra/contrat-repository-drizzle";
import { FacturesContratFactureGenerator } from "./modules/contrats-maintenance/infra/factures-contrat-facture-generator";
import type { IContratRepository } from "./modules/contrats-maintenance/application/contrat-repository";
import { createDemandesContactModule } from "./modules/demandes-contact/demandes-contact.module";
import { DemandeContactRepositoryDrizzle } from "./modules/demandes-contact/infra/demande-contact-repository-drizzle";
import type { IDemandeContactRepository } from "./modules/demandes-contact/application/demande-contact-repository";
import { createBudgetsCategoriesModule } from "./modules/budgets-categories/budgets-categories.module";
import { BudgetCategorieRepositoryDrizzle } from "./modules/budgets-categories/infra/budget-categorie-repository-drizzle";
import type { IBudgetCategorieRepository } from "./modules/budgets-categories/application/budget-categorie-repository";
import { createReglesCategorisationModule } from "./modules/regles-categorisation/regles-categorisation.module";
import { RegleCategorisationRepositoryDrizzle } from "./modules/regles-categorisation/infra/regle-categorisation-repository-drizzle";
import type { IRegleCategorisationRepository } from "./modules/regles-categorisation/application/regle-categorisation-repository";
import { createPrevisionsCAModule } from "./modules/previsions-ca/previsions-ca.module";
import { PrevisionCARepositoryDrizzle } from "./modules/previsions-ca/infra/prevision-ca-repository-drizzle";
import { FacturesCAReaderDrizzle } from "./modules/previsions-ca/infra/factures-ca-reader-drizzle";
import type { FacturesCAReader } from "./modules/previsions-ca/application/factures-ca-reader";
import { TresorerieReaderDrizzle } from "./modules/previsions-ca/infra/tresorerie-reader-drizzle";
import type { TresorerieReader } from "./modules/previsions-ca/application/tresorerie-reader";
import type { IPrevisionCARepository } from "./modules/previsions-ca/application/prevision-ca-repository";
import type { EmailPort, RateLimiterPort, LlmPort, VisionPort } from "./shared/ports";
import { ResendEmailAdapter, SlidingWindowRateLimiter, GeminiLlmAdapter, GeminiVisionAdapter } from "./shared/ports";
import { makeLlmUsageTracker } from "./shared/ports/llm-usage-tracker";
import type { AppLogger } from "./shared/ports/logger";
import { JsPdfAdapter } from "./shared/pdf/js-pdf-adapter";

export interface AppDeps extends ContextDeps {
  /*
   * Repos injectables (tests). Par défaut, repos Drizzle sur le client par défaut
   * (APP_DATABASE_URL → rôle app non-superuser soumis à la RLS).
   */
  readonly vehiculeRepo?: IVehiculeRepository;
  readonly avisRepo?: IAvisRepository;
  /** Dépendances du workflow demande d'avis (injectables en test : email/rate-limiter fakes). */
  readonly demandeAvisRepo?: IDemandeAvisRepository;
  readonly emailPort?: EmailPort;
  readonly rateLimiter?: RateLimiterPort;
  /** Port LLM (Gemini) + rate-limiter IA dédié — injectables en test (FakeLlmPort déterministe). */
  readonly llm?: LlmPort;
  /** Provider LLM AGENTIQUE (function-calling) de l'assistant ; injectable en test (FakeLlmAgenticPort). */
  readonly llmAgentic?: LlmAgenticPort;
  readonly iaRateLimiter?: RateLimiterPort;
  readonly ocrVision?: VisionPort;
  readonly lienBaseUrl?: string;
  readonly badgeRepo?: IBadgeRepository;
  readonly technicienRepo?: ITechnicienRepository;
  readonly notificationRepo?: INotificationRepository;
  readonly fournisseurRepo?: IFournisseurRepository;
  readonly commandeRepo?: ICommandeRepository;
  readonly stockRepo?: IStockRepository;
  readonly clientRepo?: IClientRepository;
  readonly interventionRepo?: IInterventionRepository;
  readonly congeRepo?: ICongeRepository;
  readonly noteDeFraisRepo?: INoteDeFraisRepository;
  readonly chantierRepo?: IChantierRepository;
  readonly depenseRepo?: IDepenseRepository;
  readonly transactionBancaireRepo?: ITransactionBancaireRepository;
  readonly fecReader?: FecReader;
  readonly devisRepo?: IDevisRepository;
  readonly factureRepo?: IFactureRepository;
  readonly devisReader?: IDevisReader;
  readonly compta?: ComptaPort;
  readonly ecritureRepo?: IEcritureRepository;
  readonly articleRepo?: IArticleRepository;
  readonly bibliothequeReader?: BibliothequeReader;
  readonly bibliothequeWriter?: BibliothequeWriter;
  readonly parametresRepo?: IParametresRepository;
  readonly modeleEmailRepo?: IModeleEmailRepository;
  readonly modeleDevisRepo?: IModeleDevisRepository;
  readonly configRelancesRepo?: IConfigRelancesRepository;
  readonly rdvRepo?: IRdvRepository;
  readonly relanceDevisRepo?: IRelanceDevisRepository;
  readonly categorieDepenseRepo?: ICategorieDepenseRepository;
  readonly contratRepo?: IContratRepository;
  readonly demandeContactRepo?: IDemandeContactRepository;
  readonly budgetCategorieRepo?: IBudgetCategorieRepository;
  readonly regleCategorisationRepo?: IRegleCategorisationRepository;
  readonly previsionCARepo?: IPrevisionCARepository;
  readonly artisanRepo?: IArtisanRepository;
  readonly devisOptionRepo?: IDevisOptionRepository;
  readonly activiteRepo?: IActiviteRepository;
  readonly modulesRepo?: IModulesRepository;
  readonly devisStatsReader?: IDevisStatsReader;
  readonly icalFeedRepo?: IIcalFeedRepository;
  readonly emailLogReader?: IEmailLogReader;
  readonly searchReader?: ISearchReader;
  readonly technicienPositionReader?: ITechnicienPositionReader;
  readonly dashboardReader?: IDashboardReader;
  readonly rapportRepo?: IRapportRepository;
  readonly utilisateurRepo?: IUtilisateurRepository;
  readonly comptabiliteReader?: IComptabiliteReader;
  readonly authRepo?: IAuthRepository;
  readonly subscriptionRepo?: ISubscriptionRepository;
  readonly stripePort?: StripePort;
  readonly stripeWebhookSecret?: string;
  readonly facturesCAReader?: FacturesCAReader;
  readonly tresorerieReader?: TresorerieReader;
}

/** Construit l'instance Fastify : /health + tRPC monté sur /api/trpc. */
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  /*
   * ⚠️ maxParamLength : le client tRPC (`httpBatchLink`) concatène N procédures dans le segment
   * d'URL `/api/trpc/p1,p2,…,pN`. Le défaut find-my-way (100 car.) rejette tout batch un peu long
   * (≥ ~4 procédures) en 404 « route not found » AVANT d'atteindre le handler tRPC → le client
   * reçoit un 404 sur tout le lot (dashboard widgets sans données, portail `valid` undefined →
   * « expiré »). On relève la limite pour couvrir les gros batchs (≈150 procédures).
   */
  const app = Fastify({
    maxParamLength: 5000,
    logger: buildFastifyLoggerConfig(),
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID().slice(0, 8),
    disableRequestLogging: true,
  });

  /*
   * Un seul log par requête (vs deux avec le logging auto Fastify) : method + path + statusCode +
   * responseTime dans une entrée structurée. On ignore /health (silence checker uptime).
   */
  app.addHook("onResponse", (req, reply, done) => {
    if (req.url === "/health") { done(); return; }
    const path = req.url.split("?")[0] ?? req.url;
    const elapsed = Math.round(reply.elapsedTime);
    const isSlow = elapsed > 1000;
    const level = reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 || isSlow ? "warn" : "info";
    const TRPC = "/api/trpc/";
    const procedures = path.startsWith(TRPC) ? path.slice(TRPC.length).split(",") : undefined;
    const clientIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress;
    req.log[level](
      {
        method: req.method,
        path,
        statusCode: reply.statusCode,
        responseTime: elapsed,
        clientIp,
        ...(procedures ? { procedures } : {}),
        ...(isSlow ? { event: "slow_request" } : {}),
      },
      isSlow ? `SLOW ${req.method} ${path} ${reply.statusCode} (${elapsed}ms)` : `${req.method} ${path} ${reply.statusCode}`,
    );
    done();
  });

  /** Adapter email partagé — reçoit app.log pour que succès/erreurs d'envoi arrivent dans BetterStack. */
  const emailAdapter = deps.emailPort ?? new ResendEmailAdapter(app.log as unknown as AppLogger);

  app.register(cookie);
  app.register(fastifySchedule);
  app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? process.env.APP_URL ?? false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.setErrorHandler<FastifyError>((error, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ event: "unhandled_error", err: error, statusCode: status }, "Erreur non gérée");
    }
    void reply.code(status).send({ error: error.message ?? "Erreur serveur" });
  });

  app.get("/health", () => ({ status: "ok" }));

  const vehiculeRepo = deps.vehiculeRepo ?? new VehiculeRepositoryDrizzle(getDbHandle().db);
  const avis = createAvisModule({
    avisRepo: deps.avisRepo ?? new AvisRepositoryDrizzle(getDbHandle().db),
    demande: {
      repo: deps.demandeAvisRepo ?? new DemandeAvisRepositoryDrizzle(getDbHandle().db),
      email: emailAdapter,
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(),
      lienBaseUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    },
    /*
     * Surface PUBLIQUE par token (portail d'avis) : lecture demande par token (policy RLS publique),
     * contexte (noms) + écriture (avis/demande/notif) sous le tenant résolu.
     */
    public: {
      reader: new PublicDemandeAvisReaderDrizzle(getDbHandle().db),
      contextReader: new PublicDemandeContextReaderDrizzle(getDbHandle().db),
      writer: new PublicAvisWriterDrizzle(getDbHandle().db),
    },
  });
  const badges = createBadgesModule({
    repository: deps.badgeRepo ?? new BadgeRepositoryDrizzle(getDbHandle().db),
  });
  /*
   * Repo techniciens partagé : module techniciens + composé par interventions (getSuggestionsTechniciens :
   * positions GPS + dispo, scopé tenant). Hoisté avant interventions.
   */
  const technicienRepo = deps.technicienRepo ?? new TechnicienRepositoryDrizzle(getDbHandle().db);
  const techniciens = createTechniciensModule({
    repository: technicienRepo,
  });
  /*
   * Repo notifications partagé : utilisé par le module notifications ET composé par stocks
   * (generateAlerts crée des notifications « Stock bas »). Une seule instance pour cohérence.
   */
  const notificationRepo = deps.notificationRepo ?? new NotificationRepositoryDrizzle(getDbHandle().db);
  const notifications = createNotificationsModule({
    repository: notificationRepo,
  });
  /*
   * Repos partagés hoistés (évite les TDZ entre modules qui se composent mutuellement) :
   *  - fournisseurs : module fournisseurs + composé par stocks (getRapportCommande) ET commandes (getPerformances)
   *  - clients : module clients + composé par rdv (list enrichi) ET commandes (listDevisAcceptes)
   *  - devis : module devis + composé par commandes (listDevisAcceptes = devis acceptés)
   */
  const fournisseurRepo = deps.fournisseurRepo ?? new FournisseurRepositoryDrizzle(getDbHandle().db);
  const clientRepo = deps.clientRepo ?? new ClientRepositoryDrizzle(getDbHandle().db);
  const devisRepo = deps.devisRepo ?? new DevisRepositoryDrizzle(getDbHandle().db);
  /*
   * Repos stock/articles hoistés : modules dédiés + composés par commandes (genererDepuisDevisIA :
   * ajustement stock + matching articleId).
   */
  const stockRepo = deps.stockRepo ?? new StockRepositoryDrizzle(getDbHandle().db);
  const articleRepo = deps.articleRepo ?? new ArticleRepositoryDrizzle(getDbHandle().db);
  /*
   * Repo factures partagé : module factures + composé par contrats (generateFacture) ET devis
   * (convertToFacture). Hoisté pour éviter le TDZ (devis se compose avant le module factures).
   */
  const factureRepo = deps.factureRepo ?? new FactureRepositoryDrizzle(getDbHandle().db);
  /** Repo modèles de devis partagé : module modelesDevis + composé par devis (getModeles/…). */
  const modeleDevisRepo = deps.modeleDevisRepo ?? new ModeleDevisRepositoryDrizzle(getDbHandle().db);
  /** Repo relances partagé : module relancesDevis + composé par devis (envoyerRelance/…). */
  const relanceDevisRepo = deps.relanceDevisRepo ?? new RelanceDevisRepositoryDrizzle(getDbHandle().db);
  const fournisseurs = createFournisseursModule({
    repository: fournisseurRepo,
  });
  const commandeRepo = deps.commandeRepo ?? new CommandeRepositoryDrizzle(getDbHandle().db);
  const commandes = createCommandesModule({
    repository: commandeRepo,
    fournisseurRepository: fournisseurRepo,
    devisRepository: devisRepo,
    clientRepository: clientRepo,
    /*
     * Envoi du bon de commande par email (PDF en PJ) : artisan reader + PdfPort/EmailPort legacy +
     * rate-limiter anti-abus (20 / 15 min). email/rate-limiter injectables en test.
     */
    mailing: {
      repo: commandeRepo,
      fournisseurRepo,
      artisanReader: new CommandeArtisanReaderDrizzle(getDbHandle().db),
      pdf: new JsPdfAdapter(),
      email: emailAdapter,
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
    },
    /*
     * Proposition IA de lignes de commande depuis un devis accepté (lecture seule) : devis + stock +
     * articles + LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan).
     */
    ia: {
      devisRepo,
      stockRepo,
      articleRepo,
      llm: deps.llm ?? new GeminiLlmAdapter(),
      trackLlm: makeLlmUsageTracker(getDbHandle().db),
      rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
    },
  });
  const stocks = createStocksModule({
    repository: stockRepo,
    notificationRepository: notificationRepo,
    fournisseurRepository: fournisseurRepo,
  });
  const clients = createClientsModule({
    repository: clientRepo,
  });
  /*
   * Repo interventions partagé : module interventions ET composé par rdv (`confirm` crée une
   * intervention planifiée liée au RDV).
   */
  const interventionRepo = deps.interventionRepo ?? new InterventionRepositoryDrizzle(getDbHandle().db);
  /*
   * Repo congés partagé : module conges + composé par interventions (assignerTechnicien : détection de
   * conflits d'agenda — congés approuvés du technicien). Hoisté avant interventions (évite le TDZ).
   */
  const congeRepo = deps.congeRepo ?? new CongeRepositoryDrizzle(getDbHandle().db);
  const interventions = createInterventionsModule({
    repository: interventionRepo,
    congeRepository: congeRepo,
    technicienRepository: technicienRepo,
  });
  const conges = createCongesModule({
    repository: congeRepo,
  });
  /*
   * Repos partagés (catégories/budgets/règles de dépense + notes de frais) : les domaines dédiés ET le
   * routeur depenses (parité client `trpc.depenses.*`) consomment les mêmes instances.
   */
  const categorieDepenseRepo = deps.categorieDepenseRepo ?? new CategorieDepenseRepositoryDrizzle(getDbHandle().db);
  const budgetCategorieRepo = deps.budgetCategorieRepo ?? new BudgetCategorieRepositoryDrizzle(getDbHandle().db);
  const regleCategorisationRepo = deps.regleCategorisationRepo ?? new RegleCategorisationRepositoryDrizzle(getDbHandle().db);
  const noteDeFraisRepo = deps.noteDeFraisRepo ?? new NoteDeFraisRepositoryDrizzle(getDbHandle().db);
  const notesDeFrais = createNotesDeFraisModule({
    repository: noteDeFraisRepo,
  });
  const chantiers = createChantiersModule({
    repository: deps.chantierRepo ?? new ChantierRepositoryDrizzle(getDbHandle().db),
  });
  const depenses = createDepensesModule({
    repository: deps.depenseRepo ?? new DepenseRepositoryDrizzle(getDbHandle().db),
    categorieRepository: categorieDepenseRepo,
    budgetRepository: budgetCategorieRepo,
    regleRepository: regleCategorisationRepo,
    noteRepository: noteDeFraisRepo,
    transactionRepository: deps.transactionBancaireRepo ?? new TransactionBancaireRepositoryDrizzle(getDbHandle().db),
    fecReader: deps.fecReader ?? new FecReaderDrizzle(getDbHandle().db),
    /** OCR justificatif : Gemini vision + rate-limiter IA dédié (injectables en test : FakeVisionPort). */
    ocr: deps.ocrVision
      ? { vision: deps.ocrVision, rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) }
      : { vision: new GeminiVisionAdapter(), rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) },
  });
  const devis = createDevisModule({
    repository: devisRepo,
    /*
     * Envoi du devis par email (PDF en PJ) + getById enrichi : readers contact partagés +
     * PdfPort/EmailPort legacy + rate-limiter anti-abus (20 / 15 min). email/rate-limiter injectables.
     */
    mailing: {
      artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
      clientReader: new SharedClientReaderDrizzle(getDbHandle().db),
      pdf: new JsPdfAdapter(),
      email: emailAdapter,
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
      signatureReader: new DevisSignatureReaderDrizzle(getDbHandle().db),
      appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    },
    /*
     * convertToFacture : délègue au domaine factures (devis accepté → facture brouillon). Partage
     * `factureRepo` (hoisté) + lecteur devis vu factures.
     */
    converter: new FacturesDevisToFactureConverter(factureRepo, new DevisReaderDrizzle(getDbHandle().db)),
    /** Modèles de devis exposés sous `devis.*` : repo partagé avec le module modelesDevis. */
    modeleRepository: modeleDevisRepo,
    /** Relances exposées sous `devis.*` : repo partagé avec le module relancesDevis. */
    relanceRepository: relanceDevisRepo,
    /** getDevisNonSignes : lecture signature (signatures_devis, scopée par le devis parent possédé). */
    signatureReader: new DevisSignatureReaderDrizzle(getDbHandle().db),
    /** genererLignesIA : LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan). */
    ia: { llm: deps.llm ?? new GeminiLlmAdapter(), trackLlm: makeLlmUsageTracker(getDbHandle().db), rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) },
  });
  /*
   * Génération FEC réelle : l'adapter ecritures implémente le seam `ComptaPort` des factures
   * (remplace le NoopComptaPort). Injectable en test ; par défaut branché sur Drizzle.
   */
  const compta =
    deps.compta ??
    new ComptaEcrituresAdapter(new EcritureRepositoryDrizzle(getDbHandle().db), new FactureReaderDrizzle(getDbHandle().db));
  const factures = createFacturesModule({
    repository: factureRepo,
    devisReader: deps.devisReader ?? new DevisReaderDrizzle(getDbHandle().db),
    compta,
    /*
     * Envoi par email (PDF en PJ) : lecture artisan/client scopée + PdfPort/EmailPort legacy +
     * rate-limiter anti-abus (20 / 15 min, parité legacy). email/rate-limiter injectables en test.
     */
    mailing: {
      artisanReader: new ArtisanReaderDrizzle(getDbHandle().db),
      clientReader: new ClientReaderDrizzle(getDbHandle().db),
      pdf: new JsPdfAdapter(),
      email: emailAdapter,
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
    },
  });
  /*
   * Domaine compta/écritures — lecture seule (balance/grand-livre/FEC). La génération est
   * l'effet de bord du workflow facture (via le ComptaPort ci-dessus).
   */
  const ecritures = createEcrituresModule({
    repository: deps.ecritureRepo ?? new EcritureRepositoryDrizzle(getDbHandle().db),
  });
  const articles = createArticlesModule({
    repository: articleRepo,
    /*
     * suggererArticlesIA : LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan) +
     * lecture du métier de l'artisan (contexte spécialisé). Injectables en test (FakeLlmPort).
     */
    ia: {
      llm: deps.llm ?? new GeminiLlmAdapter(),
      trackLlm: makeLlmUsageTracker(getDbHandle().db),
      rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
      artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    },
    /** Catalogue partagé (lecture publique) : reader NON tenant (table sans artisanId, RLS OFF). */
    bibliotheque: deps.bibliothequeReader ?? new BibliothequeReaderDrizzle(getDbHandle().db),
    /** Écritures catalogue : writer NON tenant, garde admin portée par la procédure tRPC. */
    bibliothequeWriter: deps.bibliothequeWriter ?? new BibliothequeWriterDrizzle(getDbHandle().db),
  });
  const parametres = createParametresModule({
    repository: deps.parametresRepo ?? new ParametresRepositoryDrizzle(getDbHandle().db),
  });
  const modelesEmail = createModelesEmailModule({
    repository: deps.modeleEmailRepo ?? new ModeleEmailRepositoryDrizzle(getDbHandle().db),
  });
  const modelesDevis = createModelesDevisModule({
    repository: modeleDevisRepo,
  });
  const configRelances = createConfigRelancesModule({
    repository: deps.configRelancesRepo ?? new ConfigRelancesRepositoryDrizzle(getDbHandle().db),
  });
  const rdvEnLigne = createRdvEnLigneModule({
    repository: deps.rdvRepo ?? new RdvRepositoryDrizzle(getDbHandle().db),
    interventionRepository: interventionRepo,
    clientRepository: clientRepo,
  });
  const relancesDevis = createRelancesDevisModule({
    repository: relanceDevisRepo,
  });
  const categoriesDepenses = createCategoriesDepensesModule({
    repository: categorieDepenseRepo,
  });
  const contratsMaintenance = createContratsMaintenanceModule({
    repository: deps.contratRepo ?? new ContratRepositoryDrizzle(getDbHandle().db),
    /*
     * generateFacture : réutilise le domaine factures (numéro serveur + totaux dérivés), facture émise
     * SANS écritures FEC (parité legacy). Partage l'instance `factureRepo` du module factures.
     */
    factureGenerator: new FacturesContratFactureGenerator(factureRepo),
  });
  const demandeContactRepo = deps.demandeContactRepo ?? new DemandeContactRepositoryDrizzle(getDbHandle().db);
  const demandesContact = createDemandesContactModule({ repository: demandeContactRepo });
  const budgetsCategories = createBudgetsCategoriesModule({
    repository: budgetCategorieRepo,
  });
  const reglesCategorisation = createReglesCategorisationModule({
    repository: regleCategorisationRepo,
  });
  const previsionsCA = createPrevisionsCAModule({
    repository: deps.previsionCARepo ?? new PrevisionCARepositoryDrizzle(getDbHandle().db),
    /** `calculer` agrège le CA réalisé depuis les factures PAYÉES (reader cross-domaine, scopé tenant). */
    facturesCAReader: deps.facturesCAReader ?? new FacturesCAReaderDrizzle(getDbHandle().db),
    /** `getTresoreriePrevisionnelle` : créances + avoirs + dépenses récurrentes (reader cross-domaine). */
    tresorerieReader: deps.tresorerieReader ?? new TresorerieReaderDrizzle(getDbHandle().db),
  });
  const artisan = createArtisanModule({
    repository: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
  });
  const devisOptions = createDevisOptionsModule({
    repository: deps.devisOptionRepo ?? new DevisOptionRepositoryDrizzle(getDbHandle().db),
  });
  const activites = createActivitesModule({
    repository: deps.activiteRepo ?? new ActiviteRepositoryDrizzle(getDbHandle().db),
  });
  const modules = createFeatureModulesModule({
    repository: deps.modulesRepo ?? new ModulesRepositoryDrizzle(getDbHandle().db),
  });
  const statistiques = createStatistiquesModule({
    devisStatsReader: deps.devisStatsReader ?? new DevisStatsReaderDrizzle(getDbHandle().db),
  });
  const calendrier = createCalendrierModule({
    repository: deps.icalFeedRepo ?? new IcalFeedRepositoryDrizzle(getDbHandle().db),
  });
  const emails = createEmailsModule({
    reader: deps.emailLogReader ?? new EmailLogReaderDrizzle(getDbHandle().db),
  });
  const search = createSearchModule({
    reader: deps.searchReader ?? new SearchReaderDrizzle(getDbHandle().db),
  });
  const geolocalisation = createGeolocalisationModule({
    reader: deps.technicienPositionReader ?? new TechnicienPositionReaderDrizzle(getDbHandle().db),
  });
  const dashboard = createDashboardModule({
    reader: deps.dashboardReader ?? new DashboardReaderDrizzle(getDbHandle().db),
  });
  const rapports = createRapportsModule({
    repository: deps.rapportRepo ?? new RapportRepositoryDrizzle(getDbHandle().db),
  });
  /*
   * Gestion utilisateurs (SENSIBLE, gate `utilisateurs.gerer`) : repo HORS RLS scopé artisanId +
   * hasher bcrypt (parité hash legacy) + EmailPort legacy (invitation).
   */
  const utilisateurs = createUtilisateursModule({
    repository: deps.utilisateurRepo ?? new UtilisateurRepositoryDrizzle(getDbHandle().db),
    hasher: new BcryptPasswordHasher(),
    email: emailAdapter,
  });
  /** Comptabilité (SENSIBLE, gate `comptabilite.voir`) — lectures grand-livre/balance/journal/TVA. */
  const comptabiliteReader = deps.comptabiliteReader ?? new ComptabiliteReaderDrizzle(getDbHandle().db);
  const comptabilite = createComptabiliteModule({ reader: comptabiliteReader });
  /*
   * Auth (SENSIBLE — lockout possible) : JWT émis avec le MÊME secret que le legacy (cookie inter-
   * opérable) ; bcrypt + EmailPort + rate-limiter reset + APP_URL de confiance pour le lien de reset.
   */
  const auth = createAuthModule({
    repository: deps.authRepo ?? new AuthRepositoryDrizzle(getDbHandle().db),
    hasher: new BcryptPasswordHasher(),
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    email: emailAdapter,
    resetRateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(5, 60 * 60 * 1000),
    appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
  });
  const subscription = createSubscriptionModule(deps.subscriptionRepo ?? new SubscriptionReaderDrizzle(getDbHandle().db));
  /*
   * Signature électronique de devis (SENSIBLE) — surface ARTISAN protégée + surface PUBLIQUE par
   * token (portail de signature, RLS public-token sur `devis`). `signatures_devis` est HORS RLS :
   * l'anti-IDOR passe par l'appartenance du devis parent (lue sous RLS). Immutabilité post-signature
   * garantie par la garde SQL `statut='en_attente'` dans les writers.
   */
  const signatureDb = getDbHandle().db;
  const signatureEmail = emailAdapter;
  const signatureNotifications = new SignatureNotificationWriterDrizzle(signatureDb);
  const signature = createSignatureModule({
    protectedDeps: {
      repo: new SignatureRepositoryDrizzle(signatureDb),
      contextReader: new SignatureContextReaderDrizzle(signatureDb),
      email: signatureEmail,
      notifications: signatureNotifications,
      appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    },
    publicDeps: {
      reader: new SignaturePublicReaderDrizzle(signatureDb),
      writer: new SignaturePublicWriterDrizzle(signatureDb),
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(),
      notifications: signatureNotifications,
      email: signatureEmail,
    },
  });
  /*
   * Conseils IA (tableau de bord) — 1ère slice du chantier assistant/IA. Lecture seule, NON
   * persistée ; dégradation silencieuse (rate-limit/erreur provider/JSON KO → {conseils:[]}).
   * Procédure RACINE `conseilsIA` (request/response, PAS de SSE). LlmPort Gemini (variable-path).
   */
  const conseilsIa = createConseilsIaModule({
    llm: deps.llm ?? new GeminiLlmAdapter(),
    trackLlm: makeLlmUsageTracker(getDbHandle().db),
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
    artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    statsReader: new ConseilsStatsReaderDrizzle(getDbHandle().db),
  });
  /*
   * Registry agentique de l'assistant (function-calling) — partagé entre le module tRPC (subscription
   * `assistant.stream`) et la route HTTP brute `/api/assistant/stream` (SSE hors-tRPC).
   * Hoisté ici car le module tRPC est construit avant les routes HTTP.
   */
  const agentEmail = emailAdapter;
  const agentRegistry = buildAssistantAgentRegistry(
    {
      clients: clientRepo,
      factures: factureRepo,
      devis: devisRepo,
      stocks: stockRepo,
      fournisseurs: fournisseurRepo,
      interventions: interventionRepo,
      dashboardReader: new DashboardReaderDrizzle(getDbHandle().db),
    },
    buildAssistantWriteHandlersFromRepos(
      { clientRepo, interventionRepo, devisRepo, factureRepo, devisReader: new DevisReaderDrizzle(getDbHandle().db), commandeRepo },
      {
        devis: { artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db), clientReader: new SharedClientReaderDrizzle(getDbHandle().db), signatureReader: new DevisSignatureReaderDrizzle(getDbHandle().db), appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com", pdf: new JsPdfAdapter(), email: agentEmail, rateLimiter: new SlidingWindowRateLimiter(20, 15 * 60 * 1000) },
        facture: { artisanReader: new ArtisanReaderDrizzle(getDbHandle().db), clientReader: new ClientReaderDrizzle(getDbHandle().db), pdf: new JsPdfAdapter(), email: agentEmail, rateLimiter: new SlidingWindowRateLimiter(20, 15 * 60 * 1000) },
        relance: { artisanReader: new ArtisanReaderDrizzle(getDbHandle().db), clientReader: new ClientReaderDrizzle(getDbHandle().db), email: agentEmail, rateLimiter: new SlidingWindowRateLimiter(20, 15 * 60 * 1000) },
        commande: { repo: commandeRepo, fournisseurRepo, artisanReader: new CommandeArtisanReaderDrizzle(getDbHandle().db), pdf: new JsPdfAdapter(), email: agentEmail, rateLimiter: new SlidingWindowRateLimiter(20, 15 * 60 * 1000) },
      },
    ),
  );
  const agentLlm = deps.llmAgentic ?? new GeminiAgenticAdapter();
  const agentDeps = {
    llm: agentLlm,
    trackLlm: makeLlmUsageTracker(getDbHandle().db),
    registry: agentRegistry,
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
    artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    statsReader: new AssistantStatsReaderDrizzle(getDbHandle().db),
    threadWriter: new AssistantThreadWriterDrizzle(getDbHandle().db),
  };
  /*
   * Assistant IA (lectures threads/messages + 4 générateurs IA request/response + stream agentique).
   * La subscription tRPC `assistant.stream` utilise le mode agentique (function-calling) afin de
   * supporter les outils navigate, invalidate, etc.
   */
  const assistant = createAssistantModule({
    threadsRepo: new AssistantThreadsRepositoryDrizzle(getDbHandle().db),
    generators: {
      llm: deps.llm ?? new GeminiLlmAdapter(),
      trackLlm: makeLlmUsageTracker(getDbHandle().db),
      rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
      artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
      dataReader: new AssistantDataReaderDrizzle(getDbHandle().db),
    },
    agentDeps,
  });
  /*
   * Chat support artisan↔client (request/response). Notifier email best-effort (rate-limit anti-spam
   * 20/15 min, parité legacy checkDocumentEmailRate) + lien portail si accès actif.
   */
  const chatDb = getDbHandle().db;
  const chatRepo = new ChatRepositoryDrizzle(chatDb);
  const chat = createChatModule({
    repo: chatRepo,
    notifier: new ChatClientNotifierDrizzle(
      chatDb,
      emailAdapter,
      new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
      deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    ),
  });
  /*
   * Module `support` (formulaire de contact → email à la boîte support). Sans table : EmailPort legacy
   * + rate-limiter anti-flood (5 / 15 min, parité legacy) + boîte support (env SUPPORT_EMAIL).
   */
  const support = createSupportModule({
    email: emailAdapter,
    rateLimiter: new SlidingWindowRateLimiter(5, 15 * 60 * 1000),
    destinataire: process.env.SUPPORT_EMAIL ?? "support@operioz.com",
  });
  /** Module `devices` (appareils/sessions de l'utilisateur). Table HORS RLS scopée par userId. */
  const devices = createDevicesModule({ repo: new DeviceRepositoryDrizzle(getDbHandle().db) });
  /** Module `alertesPrevisions` (alertes du prévisionnel de trésorerie). Tables SOUS RLS (artisanId). */
  const alertesPrevisions = createAlertesPrevisionsModule({ repo: new AlertesPrevisionsRepositoryDrizzle(getDbHandle().db) });
  /** Module `importErp` (import de reprise de données : clients/devis/factures légers). Tables SOUS RLS. */
  const importErp = createImportErpModule({ repo: new ImportErpRepositoryDrizzle(getDbHandle().db) });
  /*
   * Module `interventionsMobile` (app mobile technicien). Compose les repos migrés interventions/clients/
   * techniciens + le repo dédié `interventions_mobile` (SOUS RLS). RGPD : data-min par rôle technicien.
   */
  const interventionsMobile = createInterventionsMobileModule({
    interventions: interventionRepo,
    clients: clientRepo,
    techniciens: technicienRepo,
    mobile: new InterventionMobileRepositoryDrizzle(getDbHandle().db),
  });
  /*
   * Module `vitrine` (site public de l'artisan). Public par slug : reader dédié (artisans HORS RLS +
   * lectures scopées) + anti-flood IP + EmailPort + notifications + persistance lead. Admin : leads
   * (délégation `demandesContact` + `clients` pour la conversion).
   */
  const vitrine = createVitrineModule({
    reader: new VitrinePublicReaderDrizzle(getDbHandle().db),
    settings: new VitrineSettingsRepositoryDrizzle(getDbHandle().db),
    rateLimiter: new SlidingWindowRateLimiter(5, 15 * 60 * 1000),
    email: emailAdapter,
    notifications: notificationRepo,
    leads: demandeContactRepo,
    clients: clientRepo,
  });
  /*
   * Module `clientPortal` (espace client). Admin par cookie artisan + public par TOKEN (capacité, sans
   * cookie). Compose : accès portail (RLS public-token) + readers docs/planning dédiés + repo chat migré
   * + clients/notifications migrés + EmailPort + LlmPort (soumettreDemandeIA) + ArtisanReader.
   */
  const portalAccessRepo = new PortalAccessRepositoryDrizzle(getDbHandle().db);
  const clientPortal = createClientPortalModule({
    defaultOrigin: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    access: portalAccessRepo,
    docs: new PortalDocsReaderDrizzle(getDbHandle().db),
    scheduling: new PortalSchedulingReaderDrizzle(getDbHandle().db),
    chat: chatRepo,
    clients: clientRepo,
    notifications: notificationRepo,
    artisanReader: portalAccessRepo,
    artisanInfoReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    email: emailAdapter,
    rateLimiter: new SlidingWindowRateLimiter(5, 15 * 60 * 1000),
    llm: deps.llm ?? new GeminiLlmAdapter(),
    trackLlm: makeLlmUsageTracker(getDbHandle().db),
  });
  /*
   * Module `integrationsComptables` (exports/sync vers logiciels tiers). FEC réutilise le générateur du
   * domaine comptabilité (Σdébit=Σcrédit, lecture seule). Tables SOUS RLS.
   */
  const integrationsComptables = createIntegrationsComptablesModule({
    repo: new IntegrationsComptablesRepositoryDrizzle(getDbHandle().db),
    fec: { getFecContent: async (ctx, period) => (await getFecExport(comptabiliteReader, ctx, period)).content },
  });
  /*
   * Module `devisIA` (analyse photos chantier → suggestions → devis). Vision multimodal + bibliothèque
   * (match articles) + métier (ArtisanReader) + rate-limit IA. Tables SOUS RLS (anti-IDOR par l'analyse).
   */
  const devisIA = createDevisIAModule({
    repo: new DevisIARepositoryDrizzle(getDbHandle().db),
    vision: deps.ocrVision ?? new GeminiVisionAdapter(),
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
    artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    bibliotheque: deps.bibliothequeReader ?? new BibliothequeReaderDrizzle(getDbHandle().db),
  });

  const billingRepo = new BillingRepositoryDrizzle(getDbHandle().db);
  const billing = createBillingModule({
    repo: billingRepo,
    deps: { repo: billingRepo, billing: new BillingAdapter(), stripe: deps.stripePort ?? new StripeAdapter() },
  });

  const appRouter = createAppRouter({ vehiculeRepo, avis, badges, techniciens, notifications, fournisseurs, commandes, stocks, clients, interventions, conges, notesDeFrais, chantiers, depenses, devis, factures, ecritures, articles, parametres, modelesEmail, modelesDevis, configRelances, rdvEnLigne, relancesDevis, categoriesDepenses, contratsMaintenance, demandesContact, budgetsCategories, reglesCategorisation, previsionsCA, artisan, devisOptions, activites, modules, statistiques, calendrier, emails, search, geolocalisation, dashboard, rapports, utilisateurs, comptabilite, auth, subscription, signature, conseilsIa, assistant, chat, support, devices, alertesPrevisions, importErp, interventionsMobile, vitrine, clientPortal, integrationsComptables, devisIA, billing });

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      /*
       * ⚠️ Sans resolver, `tenant` reste null → toute procédure protégée renvoie 401. En production
       * (déploiement réel), on câble par défaut le DrizzleTenantResolver (lit `artisans`/`users`, hors
       * RLS) pour que l'auth par cookie `token` résolve l'artisanId. Les tests injectent leur resolver.
       */
      createContext: makeCreateContext({
        jwtSecret: deps.jwtSecret,
        resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
        /** Rôle résolu indépendamment du tenant (admin staff sans artisan) → garde `adminProcedure`. */
        roleReader: deps.roleReader ?? new DrizzleUserRoleReader(getDbHandle().db),
        /** Permissions résolues idem (table `permissions_utilisateur`) → garde `permissionProcedure`. */
        permissionsReader: deps.permissionsReader ?? new DrizzlePermissionsReader(getDbHandle().db),
      }),
    },
  });

  /** Route publique iCal `/api/calendar/:token.ics` — le jeton EST la capacité, rate-limit IP 60/min. */
  registerIcalRoute(app, {
    reader: new IcalPublicReaderDrizzle(getDbHandle().db),
    rateLimiter: new SlidingWindowRateLimiter(60, 60 * 1000),
  });

  /** Webhook Stripe SIGNÉ `/api/stripe/webhook` — vérif signature fail-closed → sync `subscriptions`. */
  registerStripeWebhookRoute(app, {
    stripe: deps.stripePort ?? new StripeAdapter(),
    paymentWriter: new WebhookPaymentWriterDrizzle(getDbHandle().db),
    notifier: new SubscriptionEventNotifierDrizzle(getDbHandle().db, emailAdapter),
    webhookSecret: deps.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "",
    appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
    onBillingWebhookEvent: (eventType, piId, fc, fm, stripeEventId) =>
      handleBillingWebhookEvent({ repo: billingRepo }, eventType, piId, fc, fm, stripeEventId),
  });

  /** Scheduler billing maison — `POST /internal/billing/tick` sécurisé par x-scheduler-secret. */
  const billingNotifier = new SubscriptionEventNotifierDrizzle(getDbHandle().db, emailAdapter);
  const billingSchedulerDeps = {
    repo: billingRepo,
    billing: new BillingAdapter(),
    notifier: billingNotifier,
    appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
  };

  registerBillingSchedulerRoute(app, { ...billingSchedulerDeps, secret: process.env.SCHEDULER_SECRET ?? "" });

  /** Cron billing maison — tick toutes les heures, lock pg_advisory_xact pour éviter les doublons multi-réplica. */
  app.register(billingCronPlugin, { schedulerDeps: billingSchedulerDeps, db: getDbHandle().db });

  /** Upload/suppression du logo artisan `/api/upload-logo` (auth cookie JWT). Stocké en data-URL base64. */
  registerUploadLogoRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    writer: new ArtisanLogoWriterDrizzle(getDbHandle().db),
  });

  /** Export FEC opposable `/api/comptabilite/fec` (auth cookie JWT) — Σdébit=Σcrédit, téléchargeable. */
  registerComptabiliteExportRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    reader: deps.comptabiliteReader ?? new ComptabiliteReaderDrizzle(getDbHandle().db),
    csvReader: new FacturesCsvReaderDrizzle(getDbHandle().db),
  });

  /** Statut de paiement + Checkout Stripe — portail client, public par token. */
  registerPaiementRoute(app, {
    reader: new PortalPaymentReaderDrizzle(getDbHandle().db),
    writer: new PortalPaymentWriterDrizzle(getDbHandle().db),
    stripe: deps.stripePort ?? new StripeAdapter(),
    rateLimiter: new SlidingWindowRateLimiter(20, 60 * 1000),
    appUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
  });

  /** Recherche publique du catalogue de référence `/api/articles/search` (sans auth). */
  registerArticlesSearchRoute(app, {
    reader: new PublicArticleSearchReaderDrizzle(getDbHandle().db),
    rateLimiter: new SlidingWindowRateLimiter(120, 60 * 1000),
  });

  /** Assistant agentique SSE `/api/assistant/stream` — réutilise agentRegistry/agentLlm hoistés ci-dessus. */
  registerAssistantAgentRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    llm: agentLlm,
    registry: agentRegistry,
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
    artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    statsReader: new AssistantStatsReaderDrizzle(getDbHandle().db),
    threadWriter: new AssistantThreadWriterDrizzle(getDbHandle().db),
  });

  /** Outil unitaire de la session vocale Live `POST /api/voice/tool` — réutilise le registry agentique. */
  registerVoiceToolRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    registry: agentRegistry,
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
  });

  /** Token éphémère Gemini Live `POST /api/voice/token` — auth cookie, déclare les mêmes outils que le registry agentique. */
  registerVoiceTokenRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    tokenPort: new GeminiRealtimeVoiceTokenAdapter(),
    artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    statsReader: new AssistantStatsReaderDrizzle(getDbHandle().db),
    threadWriter: new AssistantThreadWriterDrizzle(getDbHandle().db),
    threadsRepo: new AssistantThreadsRepositoryDrizzle(getDbHandle().db),
    tools: agentRegistry.tools,
    rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
  });

  /** PDF bon de commande fournisseur `/api/commandes-fournisseurs/:id/pdf` (auth cookie, jsPDF). */
  registerCommandePdfRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    commandeRepo,
    fournisseurReader: fournisseurRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    pdf: new JsPdfAdapter(),
  });

  /** PDF contrat de maintenance `/api/contrats/:id/pdf` (auth cookie, jsPDF). */
  registerContratPdfRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    contratRepo: deps.contratRepo ?? new ContratRepositoryDrizzle(getDbHandle().db),
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    pdf: new JsPdfAdapter(),
  });

  /** PDF bon d'intervention `/api/interventions/:id/bon-pdf` (auth cookie, jsPDF). */
  registerInterventionPdfRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    interventionRepo,
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    technicienReader: technicienRepo,
    pdf: new JsPdfAdapter(),
  });

  /** PDF devis portail client `/api/portail/:token/devis/:id/pdf` — token = capacité, rate-limit IP. */
  registerPortailDevisPdfRoute(app, {
    accessReader: new PortalPaymentReaderDrizzle(getDbHandle().db),
    devisReader: devisRepo,
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    cgvReader: {
      getCgv: async (cgvCtx) => (await getParametres(deps.parametresRepo ?? new ParametresRepositoryDrizzle(getDbHandle().db), cgvCtx)).conditionsGenerales ?? null,
    },
    pdf: new JsPdfAdapter(),
    rateLimiter: new SlidingWindowRateLimiter(60, 60 * 1000),
  });

  /*
   * §4 HORS-tRPC PUBLIQUE : PDF d'une facture depuis le portail client (`/api/portail/:token/factures/:id/pdf`,
   * token = capacité, rate-limit IP). MONTÉ mais PAS routé tant qu'absent de MIGRATED_ROUTES.
   */
  registerPortailFacturePdfRoute(app, {
    accessReader: new PortalPaymentReaderDrizzle(getDbHandle().db),
    factureReader: factureRepo,
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    cgvReader: {
      getCgv: async (cgvCtx) => (await getParametres(deps.parametresRepo ?? new ParametresRepositoryDrizzle(getDbHandle().db), cgvCtx)).conditionsGenerales ?? null,
    },
    pdf: new JsPdfAdapter(),
    rateLimiter: new SlidingWindowRateLimiter(60, 60 * 1000),
  });

  /*
   * §4 HORS-tRPC : Factur-X (XML CII + PDF facture) d'une facture (`/api/comptabilite/facturx-xml/:id`
   * + `/api/comptabilite/facturx/:id`, auth cookie). MONTÉES mais PAS routées tant qu'absentes de MIGRATED_ROUTES.
   */
  registerFacturxRoutes(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    factureReader: factureRepo,
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    pdf: new JsPdfAdapter(),
  });

  /*
   * §4 HORS-tRPC : exports en LOT (ZIP par période) — `/api/comptabilite/export-pdf-lot` (PDF facture)
   * + `/api/comptabilite/export-facturx-lot` (XML CII), auth cookie. MONTÉES mais PAS routées tant
   * qu'absentes de MIGRATED_ROUTES.
   */
  registerExportLotRoutes(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    factureLister: factureRepo,
    factureReader: factureRepo,
    clientReader: clientRepo,
    artisanReader: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
    pdf: new JsPdfAdapter(),
  });

  /*
   * §4 HORS-tRPC : polices Roboto (regular/bold) servies en statique pour les PDF générés côté client
   * (`/api/fonts/:name`, PUBLIC, cache immutable). MONTÉE mais PAS routée tant qu'absente de MIGRATED_ROUTES.
   */
  registerFontsRoute(app);

  /** §4 HORS-tRPC : télémétrie d'erreur fire-and-forget (`/api/voice/debug`, PUBLIC, sendBeacon). */
  registerVoiceDebugRoute(app, { rateLimiter: new SlidingWindowRateLimiter(30, 60 * 1000) });

  /** §4 HORS-tRPC : persistance des transcripts de la session vocale (`/api/voice/persist`, auth cookie). */
  registerVoiceRoute(app, {
    jwtSecret: deps.jwtSecret ?? process.env.JWT_SECRET ?? "",
    resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
    threadsRepo: new AssistantThreadsRepositoryDrizzle(getDbHandle().db),
    threadWriter: new AssistantThreadWriterDrizzle(getDbHandle().db),
  });

  /** Expose le routeur racine assemblé (introspection : garde-fou de cohérence des domaines montés). */
  app.decorate("appRouter", appRouter);

  /** Auto-setup webhook Stripe au démarrage (idempotent — skip si endpoint déjà présent). */
  app.addHook("onReady", async () => {
    const appUrl = deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com";
    const webhookUrl = `${appUrl}/api/stripe/webhook`;
    await ensureStripeWebhookEndpoint(process.env.STRIPE_SECRET_KEY ?? "", webhookUrl, app.log as unknown as AppLogger);
  });

  return app;
}
