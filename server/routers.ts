import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

// ============================================================================
// ARTISAN ROUTER
// ============================================================================
const artisanRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    return artisan;
  }),
  
  createProfile: protectedProcedure
    .input(z.object({
      siret: z.string().optional(),
      nomEntreprise: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      specialite: z.enum(["plomberie", "electricite", "chauffage", "multi-services"]).optional(),
      tauxTVA: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getArtisanByUserId(ctx.user.id);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Profil artisan déjà existant" });
      }
      return await db.createArtisan({ userId: ctx.user.id, ...input });
    }),
  
  updateProfile: protectedProcedure
    .input(z.object({
      siret: z.string().optional(),
      nomEntreprise: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      specialite: z.enum(["plomberie", "electricite", "chauffage", "multi-services"]).optional(),
      tauxTVA: z.string().optional(),
      logo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.updateArtisan(artisan.id, input);
    }),
});

// ============================================================================
// CLIENTS ROUTER
// ============================================================================
const clientsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getClientsByArtisanId(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const client = await db.getClientById(input.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || client.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return client;
    }),
  
  create: protectedProcedure
    .input(z.object({
      nom: z.string().min(1, "Le nom est requis"),
      prenom: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      telephone: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createClient({ artisanId: artisan.id, ...input });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().min(1).optional(),
      prenom: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      telephone: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const client = await db.getClientById(id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || client.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateClient(id, data);
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const client = await db.getClientById(input.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || client.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteClient(input.id);
      return { success: true };
    }),
  
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.searchClients(artisan.id, input.query);
    }),
});

// ============================================================================
// ARTICLES ROUTER
// ============================================================================
const articlesRouter = router({
  getBibliotheque: publicProcedure
    .input(z.object({
      metier: z.string().optional(),
      categorie: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await db.getBibliothequeArticles(input?.metier, input?.categorie);
    }),
  
  search: publicProcedure
    .input(z.object({
      query: z.string(),
      metier: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await db.searchArticles(input.query, input.metier);
    }),
  
  getArtisanArticles: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getArticlesArtisan(artisan.id);
  }),
  
  createArtisanArticle: protectedProcedure
    .input(z.object({
      reference: z.string().min(1),
      designation: z.string().min(1),
      description: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string(),
      categorie: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createArticleArtisan({ artisanId: artisan.id, ...input });
    }),
  
  updateArtisanArticle: protectedProcedure
    .input(z.object({
      id: z.number(),
      reference: z.string().optional(),
      designation: z.string().optional(),
      description: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string().optional(),
      categorie: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return await db.updateArticleArtisan(id, data);
    }),
  
  deleteArtisanArticle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteArticleArtisan(input.id);
      return { success: true };
    }),
  
  seed: protectedProcedure.mutation(async () => {
    await db.seedBibliothequeArticles();
    return { success: true };
  }),
});

// ============================================================================
// DEVIS ROUTER
// ============================================================================
const devisRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getDevisByArtisanId(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const devis = await db.getDevisById(input.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const lignes = await db.getLignesDevisByDevisId(devis.id);
      const client = await db.getClientById(devis.clientId);
      return { ...devis, lignes, client };
    }),
  
  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      objet: z.string().optional(),
      conditionsPaiement: z.string().optional(),
      notes: z.string().optional(),
      dateValidite: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      const numero = await db.getNextDevisNumber(artisan.id);
      return await db.createDevis({
        artisanId: artisan.id,
        clientId: input.clientId,
        numero,
        objet: input.objet,
        conditionsPaiement: input.conditionsPaiement,
        notes: input.notes,
        dateValidite: input.dateValidite ? new Date(input.dateValidite) : undefined,
        statut: "brouillon",
      });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      objet: z.string().optional(),
      conditionsPaiement: z.string().optional(),
      notes: z.string().optional(),
      dateValidite: z.string().optional(),
      statut: z.enum(["brouillon", "envoye", "accepte", "refuse", "expire"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateValidite, ...data } = input;
      const devis = await db.getDevisById(id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateDevis(id, {
        ...data,
        dateValidite: dateValidite ? new Date(dateValidite) : undefined,
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const devis = await db.getDevisById(input.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteDevis(input.id);
      return { success: true };
    }),
  
  addLigne: protectedProcedure
    .input(z.object({
      devisId: z.number(),
      reference: z.string().optional(),
      designation: z.string().min(1),
      description: z.string().optional(),
      quantite: z.string().default("1"),
      unite: z.string().optional(),
      prixUnitaireHT: z.string(),
      tauxTVA: z.string().default("20.00"),
    }))
    .mutation(async ({ input }) => {
      const quantite = parseFloat(input.quantite);
      const prixUnitaireHT = parseFloat(input.prixUnitaireHT);
      const tauxTVA = parseFloat(input.tauxTVA);
      
      const montantHT = quantite * prixUnitaireHT;
      const montantTVA = montantHT * (tauxTVA / 100);
      const montantTTC = montantHT + montantTVA;
      
      const ligne = await db.createLigneDevis({
        devisId: input.devisId,
        reference: input.reference,
        designation: input.designation,
        description: input.description,
        quantite: input.quantite,
        unite: input.unite,
        prixUnitaireHT: input.prixUnitaireHT,
        tauxTVA: input.tauxTVA,
        montantHT: montantHT.toFixed(2),
        montantTVA: montantTVA.toFixed(2),
        montantTTC: montantTTC.toFixed(2),
      });
      
      await db.recalculateDevisTotals(input.devisId);
      return ligne;
    }),
  
  updateLigne: protectedProcedure
    .input(z.object({
      id: z.number(),
      devisId: z.number(),
      reference: z.string().optional(),
      designation: z.string().optional(),
      description: z.string().optional(),
      quantite: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string().optional(),
      tauxTVA: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, devisId, ...data } = input;
      
      if (data.quantite || data.prixUnitaireHT || data.tauxTVA) {
        const existingLigne = await db.getLignesDevisByDevisId(devisId);
        const ligne = existingLigne.find(l => l.id === id);
        if (ligne) {
          const quantite = parseFloat(data.quantite || String(ligne.quantite));
          const prixUnitaireHT = parseFloat(data.prixUnitaireHT || String(ligne.prixUnitaireHT));
          const tauxTVA = parseFloat(data.tauxTVA || String(ligne.tauxTVA));
          
          const montantHT = quantite * prixUnitaireHT;
          const montantTVA = montantHT * (tauxTVA / 100);
          const montantTTC = montantHT + montantTVA;
          
          Object.assign(data, {
            montantHT: montantHT.toFixed(2),
            montantTVA: montantTVA.toFixed(2),
            montantTTC: montantTTC.toFixed(2),
          });
        }
      }
      
      const updated = await db.updateLigneDevis(id, data);
      await db.recalculateDevisTotals(devisId);
      return updated;
    }),
  
  deleteLigne: protectedProcedure
    .input(z.object({ id: z.number(), devisId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteLigneDevis(input.id);
      await db.recalculateDevisTotals(input.devisId);
      return { success: true };
    }),
  
  convertToFacture: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const devis = await db.getDevisById(input.devisId);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.createFactureFromDevis(input.devisId);
    }),
});

// ============================================================================
// FACTURES ROUTER
// ============================================================================
const facturesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getFacturesByArtisanId(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const lignes = await db.getLignesFacturesByFactureId(facture.id);
      const client = await db.getClientById(facture.clientId);
      return { ...facture, lignes, client };
    }),
  
  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      objet: z.string().optional(),
      conditionsPaiement: z.string().optional(),
      notes: z.string().optional(),
      dateEcheance: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      const numero = await db.getNextFactureNumber(artisan.id);
      return await db.createFacture({
        artisanId: artisan.id,
        clientId: input.clientId,
        numero,
        objet: input.objet,
        conditionsPaiement: input.conditionsPaiement,
        notes: input.notes,
        dateEcheance: input.dateEcheance ? new Date(input.dateEcheance) : undefined,
        statut: "brouillon",
      });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      objet: z.string().optional(),
      conditionsPaiement: z.string().optional(),
      notes: z.string().optional(),
      dateEcheance: z.string().optional(),
      statut: z.enum(["brouillon", "envoyee", "payee", "en_retard", "annulee"]).optional(),
      montantPaye: z.string().optional(),
      datePaiement: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateEcheance, datePaiement, ...data } = input;
      const facture = await db.getFactureById(id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateFacture(id, {
        ...data,
        dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
        datePaiement: datePaiement ? new Date(datePaiement) : undefined,
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteFacture(input.id);
      return { success: true };
    }),
  
  addLigne: protectedProcedure
    .input(z.object({
      factureId: z.number(),
      reference: z.string().optional(),
      designation: z.string().min(1),
      description: z.string().optional(),
      quantite: z.string().default("1"),
      unite: z.string().optional(),
      prixUnitaireHT: z.string(),
      tauxTVA: z.string().default("20.00"),
    }))
    .mutation(async ({ input }) => {
      const quantite = parseFloat(input.quantite);
      const prixUnitaireHT = parseFloat(input.prixUnitaireHT);
      const tauxTVA = parseFloat(input.tauxTVA);
      
      const montantHT = quantite * prixUnitaireHT;
      const montantTVA = montantHT * (tauxTVA / 100);
      const montantTTC = montantHT + montantTVA;
      
      const ligne = await db.createLigneFacture({
        factureId: input.factureId,
        reference: input.reference,
        designation: input.designation,
        description: input.description,
        quantite: input.quantite,
        unite: input.unite,
        prixUnitaireHT: input.prixUnitaireHT,
        tauxTVA: input.tauxTVA,
        montantHT: montantHT.toFixed(2),
        montantTVA: montantTVA.toFixed(2),
        montantTTC: montantTTC.toFixed(2),
      });
      
      await db.recalculateFactureTotals(input.factureId);
      return ligne;
    }),
  
  markAsPaid: protectedProcedure
    .input(z.object({
      id: z.number(),
      montantPaye: z.string(),
      datePaiement: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateFacture(input.id, {
        montantPaye: input.montantPaye,
        datePaiement: new Date(input.datePaiement),
        statut: "payee",
      });
    }),
});

// ============================================================================
// INTERVENTIONS ROUTER
// ============================================================================
const interventionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getInterventionsByArtisanId(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(intervention.clientId);
      return { ...intervention, client };
    }),
  
  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      titre: z.string().min(1),
      description: z.string().optional(),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      adresse: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createIntervention({
        artisanId: artisan.id,
        clientId: input.clientId,
        titre: input.titre,
        description: input.description,
        dateDebut: new Date(input.dateDebut),
        dateFin: input.dateFin ? new Date(input.dateFin) : undefined,
        adresse: input.adresse,
        notes: input.notes,
        statut: "planifiee",
      });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titre: z.string().optional(),
      description: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      adresse: z.string().optional(),
      notes: z.string().optional(),
      statut: z.enum(["planifiee", "en_cours", "terminee", "annulee"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateDebut, dateFin, ...data } = input;
      const intervention = await db.getInterventionById(id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateIntervention(id, {
        ...data,
        dateDebut: dateDebut ? new Date(dateDebut) : undefined,
        dateFin: dateFin ? new Date(dateFin) : undefined,
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteIntervention(input.id);
      return { success: true };
    }),
  
  getUpcoming: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getUpcomingInterventions(artisan.id, input?.limit || 5);
    }),
});

// ============================================================================
// NOTIFICATIONS ROUTER
// ============================================================================
const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getNotificationsByArtisanId(artisan.id, input?.includeArchived || false);
    }),
  
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return 0;
    return await db.getUnreadNotificationsCount(artisan.id);
  }),
  
  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.markNotificationAsRead(input.id);
      return { success: true };
    }),
  
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }
    await db.markAllNotificationsAsRead(artisan.id);
    return { success: true };
  }),
  
  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.archiveNotification(input.id);
      return { success: true };
    }),
});

// ============================================================================
// DASHBOARD ROUTER
// ============================================================================
const dashboardRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      return {
        caMonth: 0,
        caYear: 0,
        devisEnCours: 0,
        facturesImpayees: { count: 0, total: 0 },
        interventionsAVenir: 0,
        totalClients: 0,
      };
    }
    return await db.getDashboardStats(artisan.id);
  }),
  
  getUpcomingInterventions: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const interventions = await db.getUpcomingInterventions(artisan.id, 5);
    const result = [];
    for (const intervention of interventions) {
      const client = await db.getClientById(intervention.clientId);
      result.push({ ...intervention, client });
    }
    return result;
  }),
});

// ============================================================================
// PARAMETRES ROUTER
// ============================================================================
const parametresRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return null;
    return await db.getParametresArtisan(artisan.id);
  }),
  
  update: protectedProcedure
    .input(z.object({
      prefixeDevis: z.string().optional(),
      prefixeFacture: z.string().optional(),
      mentionsLegales: z.string().optional(),
      conditionsGenerales: z.string().optional(),
      notificationsEmail: z.boolean().optional(),
      rappelDevisJours: z.number().optional(),
      rappelFactureJours: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.updateParametresArtisan(artisan.id, input);
    }),
});

// ============================================================================
// MAIN APP ROUTER
// ============================================================================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  artisan: artisanRouter,
  clients: clientsRouter,
  articles: articlesRouter,
  devis: devisRouter,
  factures: facturesRouter,
  interventions: interventionsRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  parametres: parametresRouter,
});

export type AppRouter = typeof appRouter;
