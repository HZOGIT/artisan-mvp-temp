import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { sendEmail, generateDevisEmailContent, generateFactureEmailContent, generateRappelFactureContent, generateRappelInterventionContent } from "./_core/emailService";
import { sendVerificationCode, isTwilioConfigured, isValidPhoneNumber } from "./_core/smsService";

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

  // Envoi par email
  sendByEmail: protectedProcedure
    .input(z.object({
      devisId: z.number(),
      customMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const devis = await db.getDevisById(input.devisId);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(devis.clientId);
      if (!client || !client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'adresse email" });
      }

      const artisanName = artisan.nomEntreprise || "Votre artisan";
      const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
      const totalTTC = `${parseFloat(devis.totalTTC || "0").toFixed(2)} €`;

      const { subject, body } = generateDevisEmailContent({
        artisanName,
        clientName,
        devisNumero: devis.numero,
        devisObjet: devis.objet || undefined,
        totalTTC,
      });

      const finalBody = input.customMessage ? `${input.customMessage}\n\n---\n\n${body}` : body;

      const result = await sendEmail({
        to: client.email,
        subject,
        body: finalBody,
        attachmentName: `Devis_${devis.numero}.pdf`,
      });

      if (result.success) {
        // Mettre à jour le statut du devis en "envoyé"
        await db.updateDevis(devis.id, { statut: "envoye" });
        // Créer une notification
        await db.createNotification({
          artisanId: artisan.id,
          type: "succes",
          titre: "Devis envoyé",
          message: `Le devis ${devis.numero} a été envoyé à ${client.email}`,
          lien: `/devis/${devis.id}`,
        });
      }

      return result;
    }),

  // Duplication de devis
  duplicate: protectedProcedure
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

      // Créer un nouveau devis avec les mêmes informations
      const numero = await db.getNextDevisNumber(artisan.id);
      const newDevis = await db.createDevis({
        artisanId: artisan.id,
        clientId: devis.clientId,
        numero,
        objet: devis.objet ? `${devis.objet} (copie)` : "(copie)",
        conditionsPaiement: devis.conditionsPaiement || undefined,
        notes: devis.notes || undefined,
        statut: "brouillon",
      });

      // Copier les lignes du devis original
      const lignes = await db.getLignesDevisByDevisId(devis.id);
      for (const ligne of lignes) {
        await db.createLigneDevis({
          devisId: newDevis.id,
          reference: ligne.reference || undefined,
          designation: ligne.designation,
          description: ligne.description || undefined,
          quantite: ligne.quantite,
          unite: ligne.unite || undefined,
          prixUnitaireHT: ligne.prixUnitaireHT,
          tauxTVA: ligne.tauxTVA,
          montantHT: ligne.montantHT,
          montantTVA: ligne.montantTVA,
          montantTTC: ligne.montantTTC,
        });
      }

      // Recalculer les totaux
      await db.recalculateDevisTotals(newDevis.id);

      return newDevis;
    }),
  
  // Récupérer les devis non signés pour relance
  getDevisNonSignes: protectedProcedure
    .input(z.object({ joursMinimum: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getDevisNonSignes(artisan.id, input.joursMinimum || 7);
    }),
  
  // Récupérer l'historique des relances d'un devis
  getRelances: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const devisData = await db.getDevisById(input.devisId);
      if (!devisData || devisData.artisanId !== artisan.id) return [];
      return await db.getRelancesDevis(input.devisId);
    }),
  
  // Envoyer une relance par email
  envoyerRelance: protectedProcedure
    .input(z.object({
      devisId: z.number(),
      message: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      
      const devisData = await db.getDevisById(input.devisId);
      if (!devisData || devisData.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      
      const client = await db.getClientById(devisData.clientId);
      if (!client || !client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'adresse email" });
      }
      
      // Générer le contenu de l'email de relance
      const messageRelance = input.message || `Bonjour,\n\nNous vous rappelons que le devis n°${devisData.numero} est toujours en attente de votre signature.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${artisan.nomEntreprise || 'Votre artisan'}`;
      
      // Envoyer l'email
      const emailResult = await sendEmail({
        to: client.email,
        subject: `Relance - Devis n°${devisData.numero}`,
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Relance - Devis n°${devisData.numero}</h2>
          <p style="white-space: pre-line;">${messageRelance}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #7f8c8d; font-size: 12px;">
            ${artisan.nomEntreprise || ''}<br>
            ${artisan.adresse || ''}<br>
            ${artisan.codePostal || ''} ${artisan.ville || ''}<br>
            ${artisan.telephone || ''}
          </p>
        </div>`
      });
      
      // Enregistrer la relance
      await db.createRelanceDevis({
        devisId: input.devisId,
        artisanId: artisan.id,
        type: "email",
        destinataire: client.email,
        message: messageRelance,
        statut: emailResult ? "envoye" : "echec"
      });
      
      // Créer une notification
      await db.createNotification({
        artisanId: artisan.id,
        type: "info",
        titre: "Relance envoyée",
        message: `Une relance a été envoyée pour le devis ${devisData.numero} à ${client.email}`,
        lien: `/devis/${input.devisId}`
      });
      
      return { success: true, message: "Relance envoyée avec succès" };
    }),
  
  // Envoyer des relances automatiques pour tous les devis en attente
  envoyerRelancesAutomatiques: protectedProcedure
    .input(z.object({
      joursMinimum: z.number().optional(),
      joursEntreRelances: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      
      const joursMinimum = input.joursMinimum || 7;
      const joursEntreRelances = input.joursEntreRelances || 7;
      
      const devisNonSignes = await db.getDevisNonSignes(artisan.id, joursMinimum);
      let relancesEnvoyees = 0;
      
      for (const item of devisNonSignes) {
        // Vérifier si une relance a déjà été envoyée récemment
        const derniereRelance = await db.getLastRelanceDate(item.devis.id);
        if (derniereRelance) {
          const joursDepuisRelance = Math.floor((Date.now() - derniereRelance.getTime()) / (1000 * 60 * 60 * 24));
          if (joursDepuisRelance < joursEntreRelances) {
            continue; // Passer au devis suivant
          }
        }
        
        // Vérifier que le client a un email
        if (!item.client?.email) continue;
        
        // Envoyer la relance
        const messageRelance = `Bonjour,\n\nNous vous rappelons que le devis n°${item.devis.numero} est toujours en attente de votre signature.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${artisan.nomEntreprise || 'Votre artisan'}`;
        
        const emailResult = await sendEmail({
          to: item.client.email,
          subject: `Relance - Devis n°${item.devis.numero}`,
          body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Relance - Devis n°${item.devis.numero}</h2>
            <p style="white-space: pre-line;">${messageRelance}</p>
          </div>`
        });
        
        await db.createRelanceDevis({
          devisId: item.devis.id,
          artisanId: artisan.id,
          type: "email",
          destinataire: item.client.email,
          message: messageRelance,
          statut: emailResult ? "envoye" : "echec"
        });
        
        if (emailResult) relancesEnvoyees++;
      }
      
      // Créer une notification récapitulatif
      if (relancesEnvoyees > 0) {
        await db.createNotification({
          artisanId: artisan.id,
          type: "info",
          titre: "Relances automatiques",
          message: `${relancesEnvoyees} relance(s) automatique(s) envoyée(s) pour les devis en attente`,
          lien: "/devis"
        });
      }
      
      return { success: true, relancesEnvoyees };
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

  // Envoi par email
  sendByEmail: protectedProcedure
    .input(z.object({
      factureId: z.number(),
      customMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.factureId);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(facture.clientId);
      if (!client || !client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'adresse email" });
      }

      const artisanName = artisan.nomEntreprise || "Votre artisan";
      const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
      const totalTTC = `${parseFloat(facture.totalTTC || "0").toFixed(2)} €`;
      const dateEcheance = facture.dateEcheance 
        ? new Date(facture.dateEcheance).toLocaleDateString('fr-FR')
        : undefined;

      const { subject, body } = generateFactureEmailContent({
        artisanName,
        clientName,
        factureNumero: facture.numero,
        factureObjet: facture.objet || undefined,
        totalTTC,
        dateEcheance,
      });

      const finalBody = input.customMessage ? `${input.customMessage}\n\n---\n\n${body}` : body;

      const result = await sendEmail({
        to: client.email,
        subject,
        body: finalBody,
        attachmentName: `Facture_${facture.numero}.pdf`,
      });

      if (result.success) {
        // Mettre à jour le statut de la facture en "envoyée"
        await db.updateFacture(facture.id, { statut: "envoyee" });
        // Créer une notification
        await db.createNotification({
          artisanId: artisan.id,
          type: "succes",
          titre: "Facture envoyée",
          message: `La facture ${facture.numero} a été envoyée à ${client.email}`,
          lien: `/factures/${facture.id}`,
        });
      }

      return result;
    }),

  // Générer un lien de paiement Stripe
  generatePaymentLink: protectedProcedure
    .input(z.object({ factureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { createCheckoutSession, isStripeConfigured } = await import('./stripe/stripeService');
      
      if (!isStripeConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe n'est pas configuré. Veuillez configurer vos clés Stripe dans les paramètres." });
      }
      
      const facture = await db.getFactureById(input.factureId);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(facture.clientId);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      if (!client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'adresse email" });
      }
      
      // Générer un token unique pour le paiement
      const tokenPaiement = crypto.randomUUID();
      
      // Créer la session Stripe
      const origin = ctx.req.headers.origin || 'http://localhost:3000';
      const session = await createCheckoutSession({
        factureId: facture.id,
        numeroFacture: facture.numero,
        montantTTC: Number(facture.totalTTC),
        clientEmail: client.email,
        clientName: client.prenom ? `${client.prenom} ${client.nom}` : client.nom,
        artisanName: artisan.nomEntreprise || 'Artisan',
        artisanId: artisan.id,
        userId: ctx.user.id,
        origin,
        tokenPaiement,
      });
      
      // Enregistrer le paiement en base
      await db.createPaiementStripe({
        factureId: facture.id,
        artisanId: artisan.id,
        stripeSessionId: session.sessionId,
        montant: facture.totalTTC || '0',
        tokenPaiement,
        lienPaiement: session.url,
        statut: 'en_attente',
      });
      
      return { url: session.url, token: tokenPaiement };
    }),

  // Récupérer les paiements d'une facture
  getPayments: protectedProcedure
    .input(z.object({ factureId: z.number() }))
    .query(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.factureId);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.getPaiementsByFactureId(input.factureId);
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

  // Générer les rappels automatiques pour factures impayées
  generateOverdueReminders: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }

    // Récupérer les factures en retard
    const factures = await db.getFacturesByArtisanId(artisan.id);
    const facturesEnRetard = factures.filter(f => {
      if (f.statut === 'payee' || f.statut === 'annulee') return false;
      if (!f.dateEcheance) return false;
      const echeance = new Date(f.dateEcheance);
      return echeance < new Date();
    });

    let rappelsCreated = 0;
    for (const facture of facturesEnRetard) {
      const client = await db.getClientById(facture.clientId);
      const clientName = client ? (client.prenom ? `${client.prenom} ${client.nom}` : client.nom) : "Client";
      const joursRetard = Math.floor((new Date().getTime() - new Date(facture.dateEcheance!).getTime()) / (1000 * 60 * 60 * 24));

      await db.createNotification({
        artisanId: artisan.id,
        type: "rappel",
        titre: `Facture ${facture.numero} en retard`,
        message: `La facture ${facture.numero} de ${clientName} est en retard de ${joursRetard} jour(s). Montant: ${parseFloat(facture.totalTTC || "0").toFixed(2)} €`,
        lien: `/factures/${facture.id}`,
      });
      rappelsCreated++;
    }

    return { success: true, rappelsCreated };
  }),

  // Générer les rappels pour interventions à venir (J-1)
  generateUpcomingReminders: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }

    // Récupérer les interventions de demain
    const interventions = await db.getInterventionsByArtisanId(artisan.id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const interventionsDemain = interventions.filter(i => {
      if (i.statut !== 'planifiee') return false;
      const dateDebut = new Date(i.dateDebut);
      return dateDebut >= tomorrow && dateDebut < dayAfterTomorrow;
    });

    let rappelsCreated = 0;
    for (const intervention of interventionsDemain) {
      const client = await db.getClientById(intervention.clientId);
      const clientName = client ? (client.prenom ? `${client.prenom} ${client.nom}` : client.nom) : "Client";
      const dateFormatted = new Date(intervention.dateDebut).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });

      await db.createNotification({
        artisanId: artisan.id,
        type: "rappel",
        titre: `Intervention demain: ${intervention.titre}`,
        message: `Rappel: Intervention "${intervention.titre}" chez ${clientName} prévue ${dateFormatted}${intervention.adresse ? ` à ${intervention.adresse}` : ''}`,
        lien: `/interventions`,
      });
      rappelsCreated++;
    }

    return { success: true, rappelsCreated };
  }),

  // Générer tous les rappels automatiques
  generateAllReminders: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }

    let totalRappels = 0;

    // Factures en retard
    const factures = await db.getFacturesByArtisanId(artisan.id);
    const facturesEnRetard = factures.filter(f => {
      if (f.statut === 'payee' || f.statut === 'annulee') return false;
      if (!f.dateEcheance) return false;
      const echeance = new Date(f.dateEcheance);
      return echeance < new Date();
    });

    for (const facture of facturesEnRetard) {
      const client = await db.getClientById(facture.clientId);
      const clientName = client ? (client.prenom ? `${client.prenom} ${client.nom}` : client.nom) : "Client";
      const joursRetard = Math.floor((new Date().getTime() - new Date(facture.dateEcheance!).getTime()) / (1000 * 60 * 60 * 24));

      await db.createNotification({
        artisanId: artisan.id,
        type: "rappel",
        titre: `Facture ${facture.numero} en retard`,
        message: `La facture ${facture.numero} de ${clientName} est en retard de ${joursRetard} jour(s). Montant: ${parseFloat(facture.totalTTC || "0").toFixed(2)} €`,
        lien: `/factures/${facture.id}`,
      });
      totalRappels++;
    }

    // Interventions de demain
    const interventions = await db.getInterventionsByArtisanId(artisan.id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const interventionsDemain = interventions.filter(i => {
      if (i.statut !== 'planifiee') return false;
      const dateDebut = new Date(i.dateDebut);
      return dateDebut >= tomorrow && dateDebut < dayAfterTomorrow;
    });

    for (const intervention of interventionsDemain) {
      const client = await db.getClientById(intervention.clientId);
      const clientName = client ? (client.prenom ? `${client.prenom} ${client.nom}` : client.nom) : "Client";
      const dateFormatted = new Date(intervention.dateDebut).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      });

      await db.createNotification({
        artisanId: artisan.id,
        type: "rappel",
        titre: `Intervention demain: ${intervention.titre}`,
        message: `Rappel: Intervention "${intervention.titre}" chez ${clientName} prévue ${dateFormatted}${intervention.adresse ? ` à ${intervention.adresse}` : ''}`,
        lien: `/interventions`,
      });
      totalRappels++;
    }

    return { success: true, totalRappels };
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
  
  getMonthlyCA: protectedProcedure
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getMonthlyCAStats(artisan.id, input?.months || 12);
    }),
  
  getYearlyComparison: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { currentYear: 0, previousYear: 0, growth: 0 };
    return await db.getYearlyComparison(artisan.id);
  }),
  
  getConversionRate: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { totalDevis: 0, devisAcceptes: 0, rate: 0 };
    return await db.getConversionRate(artisan.id);
  }),
  
  getTopClients: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getTopClients(artisan.id, input?.limit || 5);
    }),
  
  getClientEvolution: protectedProcedure
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getClientEvolution(artisan.id, input?.months || 12);
    }),
});

// ============================================================================
// SIGNATURE ROUTER
// ============================================================================
const signatureRouter = router({
  createSignatureLink: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      
      const devisData = await db.getDevisById(input.devisId);
      if (!devisData || devisData.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      
      // Check if signature already exists
      const existingSignature = await db.getSignatureByDevisId(input.devisId);
      if (existingSignature) {
        return existingSignature;
      }
      
      // Generate unique token
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity
      
      const signature = await db.createSignatureDevis({
        devisId: input.devisId,
        token,
        expiresAt
      });
      
      // Create notification
      await db.createNotification({
        artisanId: artisan.id,
        type: "info",
        titre: "Lien de signature créé",
        message: `Un lien de signature a été créé pour le devis ${devisData.numero}`,
        lien: `/devis/${input.devisId}`
      });
      
      return signature;
    }),
  
  getSignatureByDevis: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      
      const devisData = await db.getDevisById(input.devisId);
      if (!devisData || devisData.artisanId !== artisan.id) return null;
      
      return await db.getSignatureByDevisId(input.devisId);
    }),
  
  getDevisForSignature: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const signature = await db.getSignatureByToken(input.token);
      if (!signature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      
      if (new Date() > signature.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lien de signature expiré" });
      }
      
      if (signature.signedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce devis a déjà été signé" });
      }
      
      const devisData = await db.getDevisById(signature.devisId);
      if (!devisData) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      
      const artisan = await db.getArtisanById(devisData.artisanId);
      const client = await db.getClientById(devisData.clientId);
      const lignes = await db.getLignesDevisByDevisId(devisData.id);
      
      return {
        devis: devisData,
        artisan,
        client,
        lignes,
        signature
      };
    }),
  
  // Demander l'envoi d'un code SMS pour validation
  requestSmsCode: publicProcedure
    .input(z.object({
      token: z.string(),
      telephone: z.string()
    }))
    .mutation(async ({ input }) => {
      const signature = await db.getSignatureByToken(input.token);
      if (!signature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      
      if (new Date() > signature.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lien de signature expiré" });
      }
      
      if (signature.signedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce devis a déjà été signé" });
      }
      
      // Valider le numéro de téléphone
      if (!isValidPhoneNumber(input.telephone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Numéro de téléphone invalide" });
      }
      
      // Générer un code à 6 chiffres
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Expiration dans 10 minutes
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      
      // Enregistrer la vérification SMS
      await db.createSmsVerification({
        signatureId: signature.id,
        telephone: input.telephone,
        code,
        expiresAt
      });
      
      // Envoyer le SMS via Twilio (ou simulation si non configuré)
      const smsResult = await sendVerificationCode(input.telephone, code);
      
      if (!smsResult.success) {
        console.error(`[SMS] Échec d'envoi: ${smsResult.error}`);
        // On ne lève pas d'erreur pour permettre le mode développement
      }
      
      // Vérifier si Twilio est configuré
      const twilioConfigured = isTwilioConfigured();
      
      return { 
        success: true, 
        message: twilioConfigured 
          ? "Code de vérification envoyé par SMS" 
          : "Code de vérification généré (mode développement)",
        // En mode développement (Twilio non configuré), on retourne le code
        devCode: !twilioConfigured ? code : undefined,
        twilioConfigured
      };
    }),
  
  // Vérifier le code SMS
  verifySmsCode: publicProcedure
    .input(z.object({
      token: z.string(),
      code: z.string()
    }))
    .mutation(async ({ input }) => {
      const signature = await db.getSignatureByToken(input.token);
      if (!signature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      
      const isValid = await db.verifySmsCode(signature.id, input.code);
      
      if (!isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code de vérification invalide ou expiré" });
      }
      
      return { success: true, message: "Code vérifié avec succès" };
    }),
  
  // Vérifier si une vérification SMS est requise et son état
  getSmsVerificationStatus: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const signature = await db.getSignatureByToken(input.token);
      if (!signature) {
        return { required: false, verified: false };
      }
      
      const verification = await db.getSmsVerificationBySignature(signature.id);
      
      return {
        required: true,
        verified: verification?.verified || false,
        telephone: verification?.telephone || null
      };
    }),
  
  signDevis: publicProcedure
    .input(z.object({
      token: z.string(),
      signatureData: z.string(),
      signataireName: z.string(),
      signataireEmail: z.string().email(),
      smsVerified: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const ipAddress = ctx.req.headers['x-forwarded-for'] as string || ctx.req.socket?.remoteAddress || 'unknown';
      const userAgent = ctx.req.headers['user-agent'] || 'unknown';
      
      const signature = await db.signDevis(
        input.token,
        input.signatureData,
        input.signataireName,
        input.signataireEmail,
        ipAddress,
        userAgent
      );
      
      // Get devis and artisan to create notification
      const devisData = await db.getDevisById(signature.devisId);
      if (devisData) {
        await db.createNotification({
          artisanId: devisData.artisanId,
          type: "succes",
          titre: "Devis signé !",
          message: `Le devis ${devisData.numero} a été signé par ${input.signataireName}`,
          lien: `/devis/${signature.devisId}`
        });
      }
      
      return { success: true, signature };
    }),
});

// ============================================================================
// STOCKS ROUTER
// ============================================================================
const stocksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getStocksByArtisanId(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      const stock = await db.getStockById(input.id);
      if (!stock || stock.artisanId !== artisan.id) return null;
      return stock;
    }),
  
  create: protectedProcedure
    .input(z.object({
      reference: z.string(),
      designation: z.string(),
      quantiteEnStock: z.string().optional(),
      seuilAlerte: z.string().optional(),
      unite: z.string().optional(),
      prixAchat: z.string().optional(),
      emplacement: z.string().optional(),
      fournisseur: z.string().optional(),
      articleId: z.number().optional(),
      articleType: z.enum(["bibliotheque", "artisan"]).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.createStock({ artisanId: artisan.id, ...input });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      reference: z.string().optional(),
      designation: z.string().optional(),
      seuilAlerte: z.string().optional(),
      unite: z.string().optional(),
      prixAchat: z.string().optional(),
      emplacement: z.string().optional(),
      fournisseur: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const stock = await db.getStockById(input.id);
      if (!stock || stock.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Stock non trouvé" });
      }
      const { id, ...data } = input;
      return await db.updateStock(id, data);
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const stock = await db.getStockById(input.id);
      if (!stock || stock.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Stock non trouvé" });
      }
      await db.deleteStock(input.id);
      return { success: true };
    }),
  
  adjustQuantity: protectedProcedure
    .input(z.object({
      stockId: z.number(),
      quantite: z.number(),
      type: z.enum(["entree", "sortie", "ajustement"]),
      motif: z.string().optional(),
      reference: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const stock = await db.getStockById(input.stockId);
      if (!stock || stock.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Stock non trouvé" });
      }
      return await db.adjustStock(input.stockId, input.quantite, input.type, input.motif, input.reference);
    }),
  
  getMouvements: protectedProcedure
    .input(z.object({ stockId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const stock = await db.getStockById(input.stockId);
      if (!stock || stock.artisanId !== artisan.id) return [];
      return await db.getMouvementsStock(input.stockId);
    }),
  
  getLowStock: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getLowStockItems(artisan.id);
  }),
  
  generateAlerts: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }
    
    const lowStockItems = await db.getLowStockItems(artisan.id);
    let alertsCreated = 0;
    
    for (const item of lowStockItems) {
      await db.createNotification({
        artisanId: artisan.id,
        type: "alerte",
        titre: "Stock bas",
        message: `L'article "${item.designation}" (${item.reference}) est en stock bas: ${item.quantiteEnStock} ${item.unite} (seuil: ${item.seuilAlerte})`,
        lien: "/stocks"
      });
      alertsCreated++;
    }
    
    return { alertsCreated };
  }),
  
  // Rapport de commande fournisseur
  getRapportCommande: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getRapportCommandeFournisseur(artisan.id);
  }),
  
  // Stocks en rupture avec détails fournisseur
  getStocksEnRupture: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getStocksEnRupture(artisan.id);
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
// FOURNISSEURS ROUTER
// ============================================================================
const fournisseursRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getFournisseursByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getFournisseurById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      nom: z.string(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      telephone: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.createFournisseur({ artisanId: artisan.id, ...input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      contact: z.string().optional(),
      email: z.string().email().optional(),
      telephone: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateFournisseur(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteFournisseur(input.id);
      return { success: true };
    }),

  // Article-Fournisseur associations
  getArticleFournisseurs: protectedProcedure
    .input(z.object({ articleId: z.number() }))
    .query(async ({ input }) => {
      return await db.getArticleFournisseurs(input.articleId);
    }),

  getFournisseurArticles: protectedProcedure
    .input(z.object({ fournisseurId: z.number() }))
    .query(async ({ input }) => {
      return await db.getFournisseurArticles(input.fournisseurId);
    }),

  associateArticle: protectedProcedure
    .input(z.object({
      articleId: z.number(),
      fournisseurId: z.number(),
      referenceExterne: z.string().optional(),
      prixAchat: z.string().optional(),
      delaiLivraison: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createArticleFournisseur(input);
    }),

  dissociateArticle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteArticleFournisseur(input.id);
      return { success: true };
    })});

// ============================================================================
// MODELES EMAIL ROUTER
// ============================================================================
const modelesEmailRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getModelesEmailByArtisanId(artisan.id);
  }),

  listByType: protectedProcedure
    .input(z.object({ type: z.string() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getModelesEmailByType(artisan.id, input.type);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const modele = await db.getModeleEmailById(input.id);
      if (!modele) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Modèle non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return modele;
    }),

  getDefault: protectedProcedure
    .input(z.object({ type: z.string() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      return await db.getDefaultModeleEmail(artisan.id, input.type);
    }),

  create: protectedProcedure
    .input(z.object({
      nom: z.string(),
      type: z.enum(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]),
      sujet: z.string(),
      contenu: z.string(),
      isDefault: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createModeleEmail({
        artisanId: artisan.id,
        ...input
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      sujet: z.string().optional(),
      contenu: z.string().optional(),
      isDefault: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const modele = await db.getModeleEmailById(id);
      if (!modele) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Modèle non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateModeleEmail(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const modele = await db.getModeleEmailById(input.id);
      if (!modele) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Modèle non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteModeleEmail(input.id);
      return { success: true };
    }),

  // Prévisualiser un modèle avec des variables
  preview: protectedProcedure
    .input(z.object({
      contenu: z.string(),
      variables: z.record(z.string(), z.string())
    }))
    .query(({ input }) => {
      let preview = input.contenu;
      for (const [key, value] of Object.entries(input.variables)) {
        preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      return preview;
    }),
});

// ============================================================================
// COMMANDES FOURNISSEURS ROUTER
// ============================================================================
const commandesFournisseursRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getCommandesFournisseursByArtisanId(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const commande = await db.getCommandeFournisseurById(input.id);
      if (!commande) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || commande.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const lignes = await db.getLignesCommandeFournisseur(commande.id);
      const fournisseur = await db.getFournisseurById(commande.fournisseurId);
      return { ...commande, lignes, fournisseur };
    }),

  create: protectedProcedure
    .input(z.object({
      fournisseurId: z.number(),
      reference: z.string().optional(),
      dateLivraisonPrevue: z.string().optional(),
      notes: z.string().optional(),
      lignes: z.array(z.object({
        stockId: z.number().optional(),
        designation: z.string(),
        reference: z.string().optional(),
        quantite: z.number(),
        prixUnitaire: z.number().optional()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      
      // Calculer le montant total
      const montantTotal = input.lignes.reduce((sum, l) => {
        return sum + (l.quantite * (l.prixUnitaire || 0));
      }, 0);
      
      const commande = await db.createCommandeFournisseur({
        artisanId: artisan.id,
        fournisseurId: input.fournisseurId,
        reference: input.reference,
        dateLivraisonPrevue: input.dateLivraisonPrevue ? new Date(input.dateLivraisonPrevue) : undefined,
        notes: input.notes,
        montantTotal: montantTotal.toFixed(2),
        statut: "en_attente"
      });
      
      // Créer les lignes
      for (const ligne of input.lignes) {
        await db.createLigneCommandeFournisseur({
          commandeId: commande.id,
          stockId: ligne.stockId,
          designation: ligne.designation,
          reference: ligne.reference,
          quantite: ligne.quantite.toFixed(2),
          prixUnitaire: ligne.prixUnitaire?.toFixed(2),
          montantTotal: (ligne.quantite * (ligne.prixUnitaire || 0)).toFixed(2)
        });
      }
      
      return commande;
    }),

  updateStatut: protectedProcedure
    .input(z.object({
      id: z.number(),
      statut: z.enum(["en_attente", "confirmee", "expediee", "livree", "annulee"]),
      dateLivraisonReelle: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const commande = await db.getCommandeFournisseurById(input.id);
      if (!commande) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || commande.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      const updateData: any = { statut: input.statut };
      if (input.dateLivraisonReelle) {
        updateData.dateLivraisonReelle = new Date(input.dateLivraisonReelle);
      }
      
      return await db.updateCommandeFournisseur(input.id, updateData);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const commande = await db.getCommandeFournisseurById(input.id);
      if (!commande) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || commande.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteCommandeFournisseur(input.id);
      return { success: true };
    }),

  // Performances fournisseurs
  getPerformances: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getPerformancesFournisseurs(artisan.id);
  }),
});

// ============================================================================
// MAIN APP ROUTER
// ============================================================================
export const appRouter = router({system: systemRouter,
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
  signature: signatureRouter,
  stocks: stocksRouter,
  fournisseurs: fournisseursRouter,
  modelesEmail: modelesEmailRouter,
  commandesFournisseurs: commandesFournisseursRouter,
});

export type AppRouter = typeof appRouter;
