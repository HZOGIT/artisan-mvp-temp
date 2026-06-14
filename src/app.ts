import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createAppRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";
import { getDbHandle } from "./shared/db";
import { DrizzleTenantResolver } from "./shared/tenant/drizzle-tenant-resolver";
import { DrizzleUserRoleReader, type UserRoleReader } from "./shared/tenant/role-reader";
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
import { LegacyEmailAdapter, LegacyPdfAdapter, SlidingWindowRateLimiter, GeminiLlmAdapter, GeminiVisionAdapter } from "./shared/ports";

export interface AppDeps extends ContextDeps {
  // Repos injectables (tests). Par défaut, repos Drizzle sur le client par défaut
  // (APP_DATABASE_URL → rôle app non-superuser soumis à la RLS).
  readonly vehiculeRepo?: IVehiculeRepository;
  readonly avisRepo?: IAvisRepository;
  // Dépendances du workflow demande d'avis (injectables en test : email/rate-limiter fakes).
  readonly demandeAvisRepo?: IDemandeAvisRepository;
  readonly emailPort?: EmailPort;
  readonly rateLimiter?: RateLimiterPort;
  // Port LLM (Gemini) + rate-limiter IA dédié — injectables en test (FakeLlmPort déterministe).
  readonly llm?: LlmPort;
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
  readonly facturesCAReader?: FacturesCAReader;
  readonly tresorerieReader?: TresorerieReader;
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
    // Surface PUBLIQUE par token (portail d'avis) : lecture demande par token (policy RLS publique),
    // contexte (noms) + écriture (avis/demande/notif) sous le tenant résolu.
    public: {
      reader: new PublicDemandeAvisReaderDrizzle(getDbHandle().db),
      contextReader: new PublicDemandeContextReaderDrizzle(getDbHandle().db),
      writer: new PublicAvisWriterDrizzle(getDbHandle().db),
    },
  });
  const badges = createBadgesModule({
    repository: deps.badgeRepo ?? new BadgeRepositoryDrizzle(getDbHandle().db),
  });
  // Repo techniciens partagé : module techniciens + composé par interventions (getSuggestionsTechniciens :
  // positions GPS + dispo, scopé tenant). Hoisté avant interventions.
  const technicienRepo = deps.technicienRepo ?? new TechnicienRepositoryDrizzle(getDbHandle().db);
  const techniciens = createTechniciensModule({
    repository: technicienRepo,
  });
  // Repo notifications partagé : utilisé par le module notifications ET composé par stocks
  // (generateAlerts crée des notifications « Stock bas »). Une seule instance pour cohérence.
  const notificationRepo = deps.notificationRepo ?? new NotificationRepositoryDrizzle(getDbHandle().db);
  const notifications = createNotificationsModule({
    repository: notificationRepo,
  });
  // Repos partagés hoistés (évite les TDZ entre modules qui se composent mutuellement) :
  //  - fournisseurs : module fournisseurs + composé par stocks (getRapportCommande) ET commandes (getPerformances)
  //  - clients : module clients + composé par rdv (list enrichi) ET commandes (listDevisAcceptes)
  //  - devis : module devis + composé par commandes (listDevisAcceptes = devis acceptés)
  const fournisseurRepo = deps.fournisseurRepo ?? new FournisseurRepositoryDrizzle(getDbHandle().db);
  const clientRepo = deps.clientRepo ?? new ClientRepositoryDrizzle(getDbHandle().db);
  const devisRepo = deps.devisRepo ?? new DevisRepositoryDrizzle(getDbHandle().db);
  // Repos stock/articles hoistés : modules dédiés + composés par commandes (genererDepuisDevisIA :
  // ajustement stock + matching articleId).
  const stockRepo = deps.stockRepo ?? new StockRepositoryDrizzle(getDbHandle().db);
  const articleRepo = deps.articleRepo ?? new ArticleRepositoryDrizzle(getDbHandle().db);
  // Repo factures partagé : module factures + composé par contrats (generateFacture) ET devis
  // (convertToFacture). Hoisté pour éviter le TDZ (devis se compose avant le module factures).
  const factureRepo = deps.factureRepo ?? new FactureRepositoryDrizzle(getDbHandle().db);
  // Repo modèles de devis partagé : module modelesDevis + composé par devis (getModeles/…).
  const modeleDevisRepo = deps.modeleDevisRepo ?? new ModeleDevisRepositoryDrizzle(getDbHandle().db);
  // Repo relances partagé : module relancesDevis + composé par devis (envoyerRelance/…).
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
    // Envoi du bon de commande par email (PDF en PJ) : artisan reader + PdfPort/EmailPort legacy +
    // rate-limiter anti-abus (20 / 15 min). email/rate-limiter injectables en test.
    mailing: {
      repo: commandeRepo,
      fournisseurRepo,
      artisanReader: new CommandeArtisanReaderDrizzle(getDbHandle().db),
      pdf: new LegacyPdfAdapter(),
      email: deps.emailPort ?? new LegacyEmailAdapter(),
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
    },
    // Proposition IA de lignes de commande depuis un devis accepté (lecture seule) : devis + stock +
    // articles + LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan).
    ia: {
      devisRepo,
      stockRepo,
      articleRepo,
      llm: deps.llm ?? new GeminiLlmAdapter(),
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
  // Repo interventions partagé : module interventions ET composé par rdv (`confirm` crée une
  // intervention planifiée liée au RDV).
  const interventionRepo = deps.interventionRepo ?? new InterventionRepositoryDrizzle(getDbHandle().db);
  // Repo congés partagé : module conges + composé par interventions (assignerTechnicien : détection de
  // conflits d'agenda — congés approuvés du technicien). Hoisté avant interventions (évite le TDZ).
  const congeRepo = deps.congeRepo ?? new CongeRepositoryDrizzle(getDbHandle().db);
  const interventions = createInterventionsModule({
    repository: interventionRepo,
    congeRepository: congeRepo,
    technicienRepository: technicienRepo,
  });
  const conges = createCongesModule({
    repository: congeRepo,
  });
  // Repos partagés (catégories/budgets/règles de dépense + notes de frais) : les domaines dédiés ET le
  // routeur depenses (parité client `trpc.depenses.*`) consomment les mêmes instances.
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
    // OCR justificatif : Gemini vision + rate-limiter IA dédié (injectables en test : FakeVisionPort).
    ocr: deps.ocrVision
      ? { vision: deps.ocrVision, rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) }
      : { vision: new GeminiVisionAdapter(), rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) },
  });
  const devis = createDevisModule({
    repository: devisRepo,
    // Envoi du devis par email (PDF en PJ) + getById enrichi : readers contact partagés +
    // PdfPort/EmailPort legacy + rate-limiter anti-abus (20 / 15 min). email/rate-limiter injectables.
    mailing: {
      artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
      clientReader: new SharedClientReaderDrizzle(getDbHandle().db),
      pdf: new LegacyPdfAdapter(),
      email: deps.emailPort ?? new LegacyEmailAdapter(),
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
    },
    // convertToFacture : délègue au domaine factures (devis accepté → facture brouillon). Partage
    // `factureRepo` (hoisté) + lecteur devis vu factures.
    converter: new FacturesDevisToFactureConverter(factureRepo, new DevisReaderDrizzle(getDbHandle().db)),
    // Modèles de devis exposés sous `devis.*` : repo partagé avec le module modelesDevis.
    modeleRepository: modeleDevisRepo,
    // Relances exposées sous `devis.*` : repo partagé avec le module relancesDevis.
    relanceRepository: relanceDevisRepo,
    // getDevisNonSignes : lecture signature (signatures_devis, scopée par le devis parent possédé).
    signatureReader: new DevisSignatureReaderDrizzle(getDbHandle().db),
    // genererLignesIA : LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan).
    ia: { llm: deps.llm ?? new GeminiLlmAdapter(), rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000) },
  });
  // Génération FEC réelle : l'adapter ecritures implémente le seam `ComptaPort` des factures
  // (remplace le NoopComptaPort). Injectable en test ; par défaut branché sur Drizzle.
  const compta =
    deps.compta ??
    new ComptaEcrituresAdapter(new EcritureRepositoryDrizzle(getDbHandle().db), new FactureReaderDrizzle(getDbHandle().db));
  const factures = createFacturesModule({
    repository: factureRepo,
    devisReader: deps.devisReader ?? new DevisReaderDrizzle(getDbHandle().db),
    compta,
    // Envoi par email (PDF en PJ) : lecture artisan/client scopée + PdfPort/EmailPort legacy +
    // rate-limiter anti-abus (20 / 15 min, parité legacy). email/rate-limiter injectables en test.
    mailing: {
      artisanReader: new ArtisanReaderDrizzle(getDbHandle().db),
      clientReader: new ClientReaderDrizzle(getDbHandle().db),
      pdf: new LegacyPdfAdapter(),
      email: deps.emailPort ?? new LegacyEmailAdapter(),
      rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 15 * 60 * 1000),
    },
  });
  // Domaine compta/écritures — lecture seule (balance/grand-livre/FEC). La génération est
  // l'effet de bord du workflow facture (via le ComptaPort ci-dessus).
  const ecritures = createEcrituresModule({
    repository: deps.ecritureRepo ?? new EcritureRepositoryDrizzle(getDbHandle().db),
  });
  const articles = createArticlesModule({
    repository: articleRepo,
    // suggererArticlesIA : LlmPort (Gemini) + rate-limiter IA dédié (budget horaire par artisan) +
    // lecture du métier de l'artisan (contexte spécialisé). Injectables en test (FakeLlmPort).
    ia: {
      llm: deps.llm ?? new GeminiLlmAdapter(),
      rateLimiter: deps.iaRateLimiter ?? new SlidingWindowRateLimiter(30, 60 * 60 * 1000),
      artisanReader: new SharedArtisanReaderDrizzle(getDbHandle().db),
    },
    // Catalogue partagé (lecture publique) : reader NON tenant (table sans artisanId, RLS OFF).
    bibliotheque: deps.bibliothequeReader ?? new BibliothequeReaderDrizzle(getDbHandle().db),
    // Écritures catalogue : writer NON tenant, garde admin portée par la procédure tRPC.
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
    // generateFacture : réutilise le domaine factures (numéro serveur + totaux dérivés), facture émise
    // SANS écritures FEC (parité legacy). Partage l'instance `factureRepo` du module factures.
    factureGenerator: new FacturesContratFactureGenerator(factureRepo),
  });
  const demandesContact = createDemandesContactModule({
    repository: deps.demandeContactRepo ?? new DemandeContactRepositoryDrizzle(getDbHandle().db),
  });
  const budgetsCategories = createBudgetsCategoriesModule({
    repository: budgetCategorieRepo,
  });
  const reglesCategorisation = createReglesCategorisationModule({
    repository: regleCategorisationRepo,
  });
  const previsionsCA = createPrevisionsCAModule({
    repository: deps.previsionCARepo ?? new PrevisionCARepositoryDrizzle(getDbHandle().db),
    // `calculer` agrège le CA réalisé depuis les factures PAYÉES (reader cross-domaine, scopé tenant).
    facturesCAReader: deps.facturesCAReader ?? new FacturesCAReaderDrizzle(getDbHandle().db),
    // `getTresoreriePrevisionnelle` : créances + avoirs + dépenses récurrentes (reader cross-domaine).
    tresorerieReader: deps.tresorerieReader ?? new TresorerieReaderDrizzle(getDbHandle().db),
  });
  const artisan = createArtisanModule({
    repository: deps.artisanRepo ?? new ArtisanRepositoryDrizzle(getDbHandle().db),
  });
  const appRouter = createAppRouter({ vehiculeRepo, avis, badges, techniciens, notifications, fournisseurs, commandes, stocks, clients, interventions, conges, notesDeFrais, chantiers, depenses, devis, factures, ecritures, articles, parametres, modelesEmail, modelesDevis, configRelances, rdvEnLigne, relancesDevis, categoriesDepenses, contratsMaintenance, demandesContact, budgetsCategories, reglesCategorisation, previsionsCA, artisan });

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      // ⚠️ Sans resolver, `tenant` reste null → toute procédure protégée renvoie 401. En production
      // (déploiement réel), on câble par défaut le DrizzleTenantResolver (lit `artisans`/`users`, hors
      // RLS) pour que l'auth par cookie `token` résolve l'artisanId. Les tests injectent leur resolver.
      createContext: makeCreateContext({
        jwtSecret: deps.jwtSecret,
        resolver: deps.resolver ?? new DrizzleTenantResolver(getDbHandle().db),
        // Rôle résolu indépendamment du tenant (admin staff sans artisan) → garde `adminProcedure`.
        roleReader: deps.roleReader ?? new DrizzleUserRoleReader(getDbHandle().db),
      }),
    },
  });

  // Expose le routeur racine assemblé (introspection : garde-fou de cohérence des domaines montés).
  app.decorate("appRouter", appRouter);

  return app;
}
