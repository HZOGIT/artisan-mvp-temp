/**
 * ROUTERS MVP UNIQUEMENT
 * 
 * Features gardées:
 * 1. Authentification (signin, signup, logout, me)
 * 2. Profil artisan
 * 3. Clients (CRUD complet)
 * 4. Devis (CRUD + lignes + calculs)
 * 5. Factures (CRUD + conversion depuis devis)
 * 6. Interventions (CRUD + calendrier)
 * 7. Articles/Bibliothèque
 */

import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import * as dbSecure from "./db-secure";
import { createUserWithPassword, authenticateUser } from "./_core/auth-functions";
import { createToken, setAuthCookie, clearAuthCookie } from "./_core/auth-simple";
import { COOKIE_NAME } from "../shared/const";
import { sendEmail, generateDevisEmailContent, generateFactureEmailContent, generateRappelFactureContent, generateRappelInterventionContent } from "./_core/emailService";
import { ClientInputSchema, ClientSearchSchema, ArticleSearchSchema, DevisInputSchema, FactureInputSchema, InterventionInputSchema } from "../shared/validation";

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
    return await dbSecure.getClientsByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const client = await dbSecure.getClientByIdSecure(input.id, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      return client;
    }),
  
  create: protectedProcedure
    .input(ClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await dbSecure.createClientSecure(artisan.id, input);
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      ...ClientInputSchema.partial().shape,
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const client = await dbSecure.getClientByIdSecure(id, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      return await dbSecure.updateClientSecure(id, artisan.id, data);
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const client = await dbSecure.getClientByIdSecure(input.id, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      await dbSecure.deleteClientSecure(input.id, artisan.id);
      return { success: true };
    }),
  
  search: protectedProcedure
    .input(ClientSearchSchema)
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await dbSecure.searchClientsSecure(artisan.id, input.query);
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
  
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getArticleById(input.id);
    }),
});

// ============================================================================
// DEVIS ROUTER
// ============================================================================
const devisRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await dbSecure.getDevisByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const devis = await dbSecure.getDevisByIdSecure(input.id, artisan.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const lignes = await db.getLignesDevisByDevisId(devis.id);
      const client = await dbSecure.getClientByIdSecure(devis.clientId, artisan.id);
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
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const numero = await db.getNextDevisNumber(artisan.id);
      return await dbSecure.createDevisSecure(artisan.id, input.clientId, {
        numero,
        objet: input.objet,
        conditionsPaiement: input.conditionsPaiement,
        notes: input.notes,
        dateValidite: input.dateValidite ? new Date(input.dateValidite) : undefined,
        statut: "brouillon",
        dateDevis: new Date(),
        totalHT: "0.00",
        totalTVA: "0.00",
        totalTTC: "0.00",
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
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const devis = await dbSecure.getDevisByIdSecure(id, artisan.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      return await dbSecure.updateDevisSecure(id, artisan.id, {
        ...data,
        dateValidite: dateValidite ? new Date(dateValidite) : undefined,
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const devis = await dbSecure.getDevisByIdSecure(input.id, artisan.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
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
    return await dbSecure.getFacturesByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const facture = await dbSecure.getFactureByIdSecure(input.id, artisan.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const lignes = await db.getLignesFacturesByFactureId(facture.id);
      const client = await dbSecure.getClientByIdSecure(facture.clientId, artisan.id);
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
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
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
        dateFacture: new Date(),
        totalHT: "0.00",
        totalTVA: "0.00",
        totalTTC: "0.00",
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
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateEcheance, ...data } = input;
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const facture = await dbSecure.getFactureByIdSecure(id, artisan.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      return await db.updateFacture(id, {
        ...data,
        dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const facture = await dbSecure.getFactureByIdSecure(input.id, artisan.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
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
  
  deleteLigne: protectedProcedure
    .input(z.object({ id: z.number(), factureId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteLigneFacture(input.id);
      await db.recalculateFactureTotals(input.factureId);
      return { success: true };
    }),
});

// ============================================================================
// INTERVENTIONS ROUTER
// ============================================================================
const interventionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await dbSecure.getInterventionsByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const intervention = await dbSecure.getInterventionByIdSecure(input.id, artisan.id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const client = await dbSecure.getClientByIdSecure(intervention.clientId, artisan.id);
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
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
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
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const intervention = await dbSecure.getInterventionByIdSecure(id, artisan.id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
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
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const intervention = await dbSecure.getInterventionByIdSecure(input.id, artisan.id);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
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
// APP ROUTER
// ============================================================================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      return ctx.user;
    }),
    
    signup: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await createUserWithPassword(input.email, input.password, input.name);
          const token = await createToken({ id: user.id, email: user.email || "" });
          setAuthCookie(ctx.res, token, ctx.req);
          return { success: true, user };
        } catch (error) {
          if (error instanceof Error && error.message === 'User already exists') {
            throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Signup failed' });
        }
      }),
    
    signin: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await authenticateUser(input.email, input.password);
        if (!user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }
        const token = await createToken({ id: user.id, email: user.email || "" });
        setAuthCookie(ctx.res, token, ctx.req);
        return { success: true, user };
      }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      clearAuthCookie(ctx.res);
      return { success: true };
    }),
  }),
  artisan: artisanRouter,
  clients: clientsRouter,
  articles: articlesRouter,
  devis: devisRouter,
  factures: facturesRouter,
  interventions: interventionsRouter,
});

export type AppRouter = typeof appRouter;
