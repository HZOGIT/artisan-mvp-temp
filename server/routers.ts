
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import * as dbSecure from "./db-secure";
import { createUserWithPassword, authenticateUser } from "./_core/auth";
import { createToken, setAuthCookie, clearAuthCookie } from "./_core/auth-simple";
import { COOKIE_NAME } from "../shared/const";
import { sendEmail, generateDevisEmailContent, generateFactureEmailContent, generateRappelFactureContent, generateRappelInterventionContent } from "./_core/emailService";
import { sendVerificationCode, isTwilioConfigured, isValidPhoneNumber } from "./_core/smsService";
import { ClientInputSchema, ClientSearchSchema, ArticleSearchSchema, DevisInputSchema, FactureInputSchema, InterventionInputSchema, StockInputSchema, FournisseurInputSchema } from "../shared/validation";

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
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      
      // Si le profil n'existe pas, le créer
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id, ...input });
        return artisan;
      }
      
      // Sinon, le mettre à jour
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
    // Utiliser la version sécurisée
    return await dbSecure.getClientsByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Utiliser la version sécurisée avec vérification d'ownership
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
      // Utiliser la version sécurisée
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
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(id, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      // Utiliser la version sécurisée
      return await dbSecure.updateClientSecure(id, artisan.id, data);
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(input.id, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      // Utiliser la version sécurisée
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
  
  importFromExcel: protectedProcedure
    .input(z.object({
      clients: z.array(z.object({
        nom: z.string(),
        prenom: z.string().optional(),
        email: z.string().email().optional(),
        telephone: z.string().optional(),
        adresse: z.string().optional(),
        codePostal: z.string().optional(),
        ville: z.string().optional(),
        notes: z.string().optional(),
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      
      let imported = 0;
      let skipped = 0;
      
      for (const clientData of input.clients) {
        try {
          await dbSecure.createClientSecure(artisan.id, clientData);
          imported++;
        } catch (error) {
          console.error("Erreur lors de l'import:", error);
          skipped++;
        }
      }
      
      return { imported, skipped };
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
  
  // CRUD Bibliothèque d'articles
  createBibliothequeArticle: protectedProcedure
    .input(z.object({
      reference: z.string().min(1),
      designation: z.string().min(1),
      description: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string(),
      categorie: z.string().optional(),
      sousCategorie: z.string().optional(),
      metier: z.enum(["plomberie", "electricite", "chauffage", "general"]).optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createBibliothequeArticle(input);
    }),
  
  updateBibliothequeArticle: protectedProcedure
    .input(z.object({
      id: z.number(),
      reference: z.string().optional(),
      designation: z.string().optional(),
      description: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string().optional(),
      categorie: z.string().optional(),
      sousCategorie: z.string().optional(),
      metier: z.enum(["plomberie", "electricite", "chauffage", "general"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateBibliothequeArticle(id, data);
    }),
  
  deleteBibliothequeArticle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteBibliothequeArticle(input.id);
      return { success: true };
    }),
  
  importBibliothequeArticles: protectedProcedure
    .input(z.array(z.object({
      reference: z.string(),
      designation: z.string(),
      description: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string(),
      categorie: z.string().optional(),
      sousCategorie: z.string().optional(),
      metier: z.enum(["plomberie", "electricite", "chauffage", "general"]).optional(),
    })))
    .mutation(async ({ input }) => {
      let imported = 0;
      for (const article of input) {
        await db.createBibliothequeArticle(article);
        imported++;
      }
      return { imported };
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
    // Utiliser la version sécurisée
    return await dbSecure.getDevisByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Utiliser la version sécurisée avec vérification d'ownership
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
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const numero = await db.getNextDevisNumber(artisan.id);
      // Utiliser la version sécurisée
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
      // Vérifier que le devis appartient à l'artisan
      const devis = await dbSecure.getDevisByIdSecure(id, artisan.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      // Utiliser la version sécurisée
      return await dbSecure.updateDevisSecure(id, artisan.id, {
        ...data,
        dateValidite: dateValidite ? new Date(dateValidite) : undefined,
        // Ne pas modifier les totaux ici - ils sont recalculés automatiquement
      });
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Vérifier que le devis appartient à l'artisan
      const devis = await dbSecure.getDevisByIdSecure(input.id, artisan.id);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }
      // Supprimer avec vérification d'ownership
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

  generatePDF: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ ctx, input }) => {
      const devis = await db.getDevisById(input.devisId);
      if (!devis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouve" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acces non autorise" });
      }
      const client = await db.getClientById(devis.clientId);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouve" });
      }
      const lignes = await db.getLignesDevisByDevisId(devis.id);
      
      const { generateDevisPDF } = await import("./_core/pdfGenerator");
      const pdfBuffer = generateDevisPDF({ devis: { ...devis, lignes }, artisan, client });
      
      return {
        pdf: pdfBuffer.toString("base64"),
        filename: `Devis_${devis.numero}.pdf`,
      };
    }),

  // Envoi par email
  sendByEmail: protectedProcedure
    .input(z.object({
      devisId: z.number(),
      customMessage: z.string().optional(),
      attachPdf: z.boolean().optional().default(true),
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

      const dateValidite = devis.dateValidite
        ? new Date(devis.dateValidite).toLocaleDateString("fr-FR")
        : undefined;

      const { subject, body } = generateDevisEmailContent({
        artisanName,
        clientName,
        devisNumero: devis.numero,
        devisObjet: devis.objet || undefined,
        totalTTC,
        dateValidite,
      });

      const finalBody = input.customMessage
        ? body.replace('</body>', `<div style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;margin:0 40px;padding-top:16px;">${input.customMessage.replace(/\n/g, '<br>')}</div></body>`)
        : body;

      // Générer le PDF si demandé
      let attachmentContent: string | undefined;
      if (input.attachPdf) {
        const lignes = await db.getLignesDevisByDevisId(devis.id);
        const { generateDevisPDF } = await import("./_core/pdfGenerator");
        const pdfBuffer = generateDevisPDF({ devis: { ...devis, lignes }, artisan, client });
        attachmentContent = pdfBuffer.toString("base64");
      }

      const result = await sendEmail({
        to: client.email,
        subject,
        body: finalBody,
        attachmentName: input.attachPdf ? `Devis_${devis.numero}.pdf` : undefined,
        attachmentContent,
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

  // Modèles de devis
  getModeles: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getModelesDevisByArtisanId(artisan.id);
  }),

  createModele: protectedProcedure
    .input(z.object({
      nom: z.string().min(1),
      description: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      return await db.createModeleDevis(artisan.id, input);
    }),

  getModeleWithLignes: protectedProcedure
    .input(z.object({ modeleId: z.number() }))
    .query(async ({ ctx, input }) => {
      const modele = await db.getModeleDevisById(input.modeleId);
      if (!modele) throw new TRPCError({ code: "NOT_FOUND", message: "Modèle non trouvé" });
      
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès refusé" });
      }
      
      const lignes = await db.getModeleDevisLignes(input.modeleId);
      return { modele, lignes };
    }),

  addLigneToModele: protectedProcedure
    .input(z.object({
      modeleId: z.number(),
      articleId: z.number().optional(),
      designation: z.string().min(1),
      description: z.string().optional(),
      quantite: z.number().default(1),
      unite: z.string().default("unité"),
      prixUnitaireHT: z.number().default(0),
      tauxTVA: z.number().default(20),
      remise: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      
      const modele = await db.getModeleDevisById(input.modeleId);
      if (!modele || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès refusé" });
      }
      
      return await db.addLigneToModeleDevis(input.modeleId, {
        articleId: input.articleId,
        designation: input.designation,
        description: input.description,
        quantite: input.quantite,
        unite: input.unite,
        prixUnitaireHT: input.prixUnitaireHT,
        tauxTVA: input.tauxTVA,
        remise: input.remise,
      });
    }),

  deleteModele: protectedProcedure
    .input(z.object({ modeleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      
      const modele = await db.getModeleDevisById(input.modeleId);
      if (!modele || modele.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès refusé" });
      }
      
      await db.deleteModeleDevis(input.modeleId);
      return { success: true };
    }),
});

// ============================================================================
// FACTURES ROUTER
// ============================================================================
const facturesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    // Utiliser la version sécurisée
    return await dbSecure.getFacturesByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Utiliser la version sécurisée avec vérification d'ownership
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
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const numero = await db.getNextFactureNumber(artisan.id);
      // Utiliser la version sécurisée (créer une fonction si nécessaire)
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
      montantPaye: z.string().optional(),
      datePaiement: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateEcheance, datePaiement, ...data } = input;
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Vérifier que la facture appartient à l'artisan
      const facture = await dbSecure.getFactureByIdSecure(id, artisan.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
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
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Vérifier que la facture appartient à l'artisan
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
  
  markAsPaid: protectedProcedure
    .input(z.object({
      id: z.number(),
      montantPaye: z.string(),
      datePaiement: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvee" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acces non autorise" });
      }
      return await db.updateFacture(input.id, {
        montantPaye: input.montantPaye,
        datePaiement: new Date(input.datePaiement),
        statut: "payee",
      });
    }),

  generatePDF: protectedProcedure
    .input(z.object({ factureId: z.number() }))
    .query(async ({ ctx, input }) => {
      const facture = await db.getFactureById(input.factureId);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvee" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acces non autorise" });
      }
      const client = await db.getClientById(facture.clientId);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouve" });
      }
      const lignes = await db.getLignesFacturesByFactureId(facture.id);
      
      const { generateFacturePDF } = await import("./_core/pdfGenerator");
      const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });
      
      return {
        pdf: pdfBuffer.toString("base64"),
        filename: `Facture_${facture.numero}.pdf`,
      };
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
    // Utiliser la version sécurisée
    return await dbSecure.getInterventionsByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Utiliser la version sécurisée avec vérification d'ownership
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
      // Vérifier que le client appartient à l'artisan
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
      // Vérifier que l'intervention appartient à l'artisan
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
      // Vérifier que l'intervention appartient à l'artisan
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
  
  // Planification intelligente - Suggestions de techniciens
  getSuggestionsTechniciens: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      dateIntervention: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getSuggestionsTechniciens(
        artisan.id,
        input.latitude,
        input.longitude,
        new Date(input.dateIntervention)
      );
    }),
  
  // Obtenir le technicien le plus proche disponible
  getTechnicienPlusProche: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      dateIntervention: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      return await db.getTechnicienPlusProche(
        artisan.id,
        input.latitude,
        input.longitude,
        new Date(input.dateIntervention)
      );
    }),
  
  // Assigner un technicien à une intervention
  assignerTechnicien: protectedProcedure
    .input(z.object({
      interventionId: z.number(),
      technicienId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return await db.updateIntervention(input.interventionId, {
        technicienId: input.technicienId
      });
    }),

  // Gestion des couleurs personnalisées du calendrier
  getCouleursCalendrier: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return {};
    return await db.getCouleursCalendrier(artisan.id);
  }),

  setCouleurIntervention: protectedProcedure
    .input(z.object({
      interventionId: z.number(),
      couleur: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      await db.setCouleurIntervention(artisan.id, input.interventionId, input.couleur);
      return { success: true };
    }),

  deleteCouleurIntervention: protectedProcedure
    .input(z.object({ interventionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      await db.deleteCouleurIntervention(artisan.id, input.interventionId);
      return { success: true };
    }),

  setCouleursMultiples: protectedProcedure
    .input(z.object({
      couleurs: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const couleursNumeriques: Record<number, string> = {};
      for (const [key, value] of Object.entries(input.couleurs)) {
        couleursNumeriques[parseInt(key)] = value;
      }
      await db.setCouleursMultiples(artisan.id, couleursNumeriques);
      return { success: true };
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
    // Utiliser la version sécurisée
    return await dbSecure.getStocksByArtisanIdSecure(artisan.id);
  }),
  
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      const stock = await db.getStockById(input.id);
      // Vérifier que le stock appartient à l'artisan
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
    // Utiliser la version sécurisée
    return await dbSecure.getFournisseursByArtisanIdSecure(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      const fournisseur = await db.getFournisseurById(input.id);
      // Vérifier que le fournisseur appartient à l'artisan
      if (!fournisseur || fournisseur.artisanId !== artisan.id) return null;
      return fournisseur;
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
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const fournisseur = await db.getFournisseurById(input.id);
      if (!fournisseur || fournisseur.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur non trouvé" });
      }
      const { id, ...data } = input;
      await db.updateFournisseur(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const fournisseur = await db.getFournisseurById(input.id);
      if (!fournisseur || fournisseur.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur non trouvé" });
      }
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
      variables: z.string().optional(),
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
      type: z.enum(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]).optional(),
      sujet: z.string().optional(),
      contenu: z.string().optional(),
      variables: z.string().optional(),
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
// CLIENT PORTAL ROUTER (Public access for clients)
// ============================================================================
const clientPortalRouter = router({
  // Générer un lien d'accès au portail client
  generateAccess: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const client = await db.getClientById(input.clientId);
      if (!client || client.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      if (!client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'adresse email" });
      }
      
      // Générer un token unique
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Valide 30 jours
      
      await db.createClientPortalAccess({
        clientId: client.id,
        artisanId: artisan.id,
        token,
        email: client.email,
        expiresAt,
      });
      
      const origin = ctx.req.headers.origin || 'http://localhost:3000';
      return { url: `${origin}/portail/${token}`, token };
    }),

  // Vérifier l'accès au portail (public)
  verifyAccess: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        return { valid: false, client: null, artisan: null };
      }
      
      await db.updateClientPortalAccessLastAccess(access.id);
      
      const client = await db.getClientById(access.clientId);
      const artisan = await db.getArtisanById(access.artisanId);
      
      return {
        valid: true,
        client: client ? { id: client.id, nom: client.nom, prenom: client.prenom, email: client.email } : null,
        artisan: artisan ? { id: artisan.id, nomEntreprise: artisan.nomEntreprise, telephone: artisan.telephone, email: artisan.email } : null,
      };
    }),

  // Récupérer les devis du client (public avec token)
  getDevis: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      const devisList = await db.getDevisByClientId(access.clientId);
      return devisList.map(d => ({
        id: d.id,
        numero: d.numero,
        objet: d.objet,
        totalTTC: d.totalTTC,
        statut: d.statut,
        dateCreation: d.createdAt,
        tokenSignature: (d as any).tokenSignature || null,
      }));
    }),

  // Récupérer les factures du client (public avec token)
  getFactures: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      const facturesList = await db.getFacturesByClientId(access.clientId);
      // Récupérer les paiements pour chaque facture
      const facturesWithPayments = await Promise.all(facturesList.map(async (f) => {
        const paiements = await db.getPaiementsByFactureId(f.id);
        const paiementEnCours = paiements.find(p => p.statut === 'en_attente');
        return {
          id: f.id,
          numero: f.numero,
          objet: f.objet,
          totalTTC: f.totalTTC,
          statut: f.statut,
          dateCreation: f.createdAt,
          dateEcheance: f.dateEcheance,
          lienPaiement: paiementEnCours?.lienPaiement || null,
        };
      }));
      return facturesWithPayments;
    }),

  // Récupérer les interventions du client (public avec token)
  getInterventions: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      const interventionsList = await db.getInterventionsByClientId(access.clientId);
      return interventionsList.map(i => ({
        id: i.id,
        titre: i.titre,
        description: i.description,
        dateIntervention: i.dateDebut,
        statut: i.statut,
        adresse: i.adresse,
      }));
    }),

  // Récupérer les contrats du client (public avec token)
  getContrats: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      return await db.getContratsByClientId(access.clientId);
    }),
});

// ============================================================================
// CONTRATS MAINTENANCE ROUTER
// ============================================================================
const contratsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const contrats = await db.getContratsByArtisanId(artisan.id);
    // Enrichir avec les infos client
    return Promise.all(contrats.map(async (c) => {
      const client = await db.getClientById(c.clientId);
      return { ...c, client };
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.id);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(contrat.clientId);
      const facturesRecurrentes = await db.getFacturesRecurrentesByContratId(contrat.id);
      return { ...contrat, client, facturesRecurrentes };
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      titre: z.string(),
      description: z.string().optional(),
      montantHT: z.string(),
      tauxTVA: z.string().optional(),
      periodicite: z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      const reference = await db.getNextContratNumber(artisan.id);
      
      // Calculer la prochaine date de facturation
      const dateDebut = new Date(input.dateDebut);
      let prochainFacturation = new Date(dateDebut);
      
      return await db.createContrat({
        artisanId: artisan.id,
        clientId: input.clientId,
        reference,
        titre: input.titre,
        description: input.description,
        montantHT: input.montantHT,
        tauxTVA: input.tauxTVA || "20.00",
        periodicite: input.periodicite,
        dateDebut,
        dateFin: input.dateFin ? new Date(input.dateFin) : undefined,
        prochainFacturation,
        statut: "actif",
        notes: input.notes,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titre: z.string().optional(),
      description: z.string().optional(),
      montantHT: z.string().optional(),
      tauxTVA: z.string().optional(),
      periodicite: z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]).optional(),
      dateFin: z.string().optional(),
      statut: z.enum(["actif", "suspendu", "termine", "annule"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.id);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      const { id, ...updateData } = input;
      return await db.updateContrat(id, {
        ...updateData,
        dateFin: updateData.dateFin ? new Date(updateData.dateFin) : undefined,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.id);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      await db.deleteContrat(input.id);
      return { success: true };
    }),

  // Générer une facture manuellement pour un contrat
  generateFacture: protectedProcedure
    .input(z.object({ contratId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.contratId);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      // Créer la facture
      const numero = await db.getNextFactureNumber(artisan.id);
      const montantHT = parseFloat(contrat.montantHT || "0");
      const tauxTVA = parseFloat(contrat.tauxTVA || "20");
      const montantTVA = montantHT * (tauxTVA / 100);
      const montantTTC = montantHT + montantTVA;
      
      const facture = await db.createFacture({
        artisanId: artisan.id,
        clientId: contrat.clientId,
        numero,
        objet: `${contrat.titre} - ${contrat.reference}`,
        totalHT: montantHT.toFixed(2),
        totalTVA: montantTVA.toFixed(2),
        totalTTC: montantTTC.toFixed(2),
        statut: "envoyee",
        notes: `Facture générée automatiquement pour le contrat ${contrat.reference}`,
      });
      
      // Créer la ligne de facture
      await db.createLigneFacture({
        factureId: facture.id,
        designation: contrat.titre,
        description: contrat.description || undefined,
        quantite: "1",
        prixUnitaireHT: contrat.montantHT || "0",
        tauxTVA: contrat.tauxTVA || "20.00",
        montantHT: contrat.montantHT || "0",
        montantTTC: montantTTC.toFixed(2),
      });
      
      // Enregistrer la facture récurrente
      const now = new Date();
      let periodeFin = new Date(now);
      switch (contrat.periodicite) {
        case 'mensuel': periodeFin.setMonth(periodeFin.getMonth() + 1); break;
        case 'trimestriel': periodeFin.setMonth(periodeFin.getMonth() + 3); break;
        case 'semestriel': periodeFin.setMonth(periodeFin.getMonth() + 6); break;
        case 'annuel': periodeFin.setFullYear(periodeFin.getFullYear() + 1); break;
      }
      
      await db.createFactureRecurrente({
        contratId: contrat.id,
        factureId: facture.id,
        periodeDebut: now,
        periodeFin,
        genereeAutomatiquement: false,
      });
      
      // Mettre à jour la prochaine date de facturation
      await db.updateContrat(contrat.id, { prochainFacturation: periodeFin });
      
      return facture;
    }),
});

// ============================================================================
// INTERVENTIONS MOBILE ROUTER
// ============================================================================
const interventionsMobileRouter = router({
  // Récupérer les interventions du jour pour le mobile
  getTodayInterventions: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const interventionsList = await db.getInterventionsByArtisanId(artisan.id);
    const todayInterventions = interventionsList.filter(i => {
      const date = new Date(i.dateDebut);
      return date >= today && date < tomorrow;
    });
    
    // Enrichir avec les données mobiles et client
    return Promise.all(todayInterventions.map(async (i) => {
      const client = await db.getClientById(i.clientId);
      const mobileData = await db.getInterventionMobileByInterventionId(i.id);
      return { ...i, client, mobileData };
    }));
  }),

  // Démarrer une intervention (arrivée sur site)
  startIntervention: protectedProcedure
    .input(z.object({
      interventionId: z.number(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      // Mettre à jour le statut de l'intervention
      await db.updateIntervention(input.interventionId, { statut: 'en_cours' });
      
      // Créer ou mettre à jour les données mobiles
      let mobileData = await db.getInterventionMobileByInterventionId(input.interventionId);
      if (mobileData) {
        mobileData = await db.updateInterventionMobile(mobileData.id, {
          heureArrivee: new Date(),
          latitude: input.latitude?.toString(),
          longitude: input.longitude?.toString(),
        });
      } else {
        mobileData = await db.createInterventionMobile({
          interventionId: input.interventionId,
          artisanId: artisan.id,
          heureArrivee: new Date(),
          latitude: input.latitude?.toString(),
          longitude: input.longitude?.toString(),
        });
      }
      
      return mobileData;
    }),

  // Terminer une intervention
  endIntervention: protectedProcedure
    .input(z.object({
      interventionId: z.number(),
      notes: z.string().optional(),
      signatureClient: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      // Mettre à jour le statut de l'intervention
      await db.updateIntervention(input.interventionId, { statut: 'terminee' });
      
      // Mettre à jour les données mobiles
      const mobileData = await db.getInterventionMobileByInterventionId(input.interventionId);
      if (mobileData) {
        await db.updateInterventionMobile(mobileData.id, {
          heureDepart: new Date(),
          notesIntervention: input.notes,
          signatureClient: input.signatureClient,
          signatureDate: input.signatureClient ? new Date() : undefined,
        });
      }
      
      return { success: true };
    }),

  // Ajouter une photo
  addPhoto: protectedProcedure
    .input(z.object({
      interventionId: z.number(),
      url: z.string(),
      description: z.string().optional(),
      type: z.enum(["avant", "pendant", "apres"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      // Récupérer ou créer les données mobiles
      let mobileData = await db.getInterventionMobileByInterventionId(input.interventionId);
      if (!mobileData) {
        mobileData = await db.createInterventionMobile({
          interventionId: input.interventionId,
          artisanId: artisan.id,
        });
      }
      
      return await db.createPhotoIntervention({
        interventionMobileId: mobileData.id,
        url: input.url,
        description: input.description,
        type: input.type || 'pendant',
      });
    }),

  // Récupérer les photos d'une intervention
  getPhotos: protectedProcedure
    .input(z.object({ interventionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      const mobileData = await db.getInterventionMobileByInterventionId(input.interventionId);
      if (!mobileData) return [];
      
      return await db.getPhotosByInterventionMobileId(mobileData.id);
    }),
});

// ============================================================================
// CHAT ROUTER
// ============================================================================
const chatRouter = router({
  // Récupérer les conversations de l'artisan
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const convs = await db.getConversationsByArtisanId(artisan.id);
    
    // Enrichir avec les infos client
    const enriched = await Promise.all(convs.map(async (conv) => {
      const client = await db.getClientById(conv.clientId);
      const msgs = await db.getMessagesByConversationId(conv.id);
      const unreadCount = msgs.filter(m => m.expediteur === 'client' && !m.lu).length;
      return { ...conv, client, unreadCount };
    }));
    
    return enriched;
  }),

  // Récupérer les messages d'une conversation
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      // Marquer les messages comme lus
      await db.markMessagesAsRead(input.conversationId, 'artisan');
      
      return await db.getMessagesByConversationId(input.conversationId);
    }),

  // Envoyer un message
  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      contenu: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      return await db.createMessage({
        conversationId: input.conversationId,
        expediteur: 'artisan',
        contenu: input.contenu,
      });
    }),

  // Démarrer une conversation avec un client
  startConversation: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      sujet: z.string().optional(),
      premierMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const client = await db.getClientById(input.clientId);
      if (!client || client.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client non trouvé" });
      }
      
      const conv = await db.getOrCreateConversation(artisan.id, input.clientId, input.sujet);
      
      if (input.premierMessage) {
        await db.createMessage({
          conversationId: conv.id,
          expediteur: 'artisan',
          contenu: input.premierMessage,
        });
      }
      
      return conv;
    }),

  // Compter les messages non lus
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return 0;
    return await db.getUnreadMessagesCount(artisan.id);
  }),

  // Archiver une conversation
  archiveConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      
      return await db.updateConversation(input.conversationId, { statut: 'archivee' });
    }),
});

// ============================================================================
// TECHNICIENS ROUTER
// ============================================================================
const techniciensRouter = router({
  // Récupérer tous les techniciens
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getTechniciensByArtisanId(artisan.id);
  }),

  // Récupérer un technicien par ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.id);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      return technicien;
    }),

  // Créer un technicien
  create: protectedProcedure
    .input(z.object({
      nom: z.string().min(1),
      prenom: z.string().optional(),
      email: z.string().email().optional(),
      telephone: z.string().optional(),
      specialite: z.string().optional(),
      couleur: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      return await db.createTechnicien({
        artisanId: artisan.id,
        ...input,
      });
    }),

  // Mettre à jour un technicien
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().min(1).optional(),
      prenom: z.string().optional(),
      email: z.string().email().optional(),
      telephone: z.string().optional(),
      specialite: z.string().optional(),
      couleur: z.string().optional(),
      statut: z.enum(["actif", "inactif", "conge"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.id);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      const { id, ...data } = input;
      return await db.updateTechnicien(id, data);
    }),

  // Supprimer un technicien
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.id);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      await db.deleteTechnicien(input.id);
      return { success: true };
    }),

  // Récupérer les techniciens disponibles pour une date
  getDisponibles: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getTechniciensDisponibles(artisan.id, new Date(input.date));
    }),

  // Récupérer les disponibilités d'un technicien
  getDisponibilites: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.technicienId);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      return await db.getDisponibilitesByTechnicienId(input.technicienId);
    }),

  // Définir les disponibilités d'un technicien
  setDisponibilite: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      jourSemaine: z.number().min(0).max(6),
      heureDebut: z.string(),
      heureFin: z.string(),
      disponible: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.technicienId);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      return await db.setDisponibilite(input);
    }),

  // Statistiques par technicien
  getStats: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const technicien = await db.getTechnicienById(input.technicienId);
      if (!technicien || technicien.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouvé" });
      }
      
      // Récupérer les interventions assignées à ce technicien
      const allInterventions = await db.getInterventionsByArtisanId(artisan.id);
      const interventionsTech = allInterventions.filter(i => i.technicienId === input.technicienId);
      
      const total = interventionsTech.length;
      const terminees = interventionsTech.filter(i => i.statut === 'terminee').length;
      const enCours = interventionsTech.filter(i => i.statut === 'en_cours').length;
      const planifiees = interventionsTech.filter(i => i.statut === 'planifiee').length;
      
      return { total, terminees, enCours, planifiees };
    }),
});

// ============================================================================
// AVIS CLIENTS ROUTER
// ============================================================================
const avisRouter = router({
  // Récupérer tous les avis
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const avis = await db.getAvisByArtisanId(artisan.id);
    
    // Enrichir avec les infos client et intervention
    const enriched = await Promise.all(avis.map(async (a) => {
      const client = await db.getClientById(a.clientId);
      const intervention = a.interventionId ? await db.getInterventionById(a.interventionId) : null;
      return { ...a, client, intervention };
    }));
    
    return enriched;
  }),

  // Statistiques des avis
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { moyenne: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    return await db.getAvisStats(artisan.id);
  }),

  // Envoyer une demande d'avis après intervention
  envoyerDemande: protectedProcedure
    .input(z.object({ interventionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      
      const client = await db.getClientById(intervention.clientId);
      if (!client || !client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'email" });
      }
      
      // Générer un token unique
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14); // Expire dans 14 jours
      
      // Créer la demande d'avis
      const demande = await db.createDemandeAvis({
        artisanId: artisan.id,
        clientId: client.id,
        interventionId: input.interventionId,
        tokenDemande: token,
        emailEnvoyeAt: new Date(),
        expiresAt,
      });
      
      // Envoyer l'email
      const baseUrl = ctx.req.headers.origin || 'http://localhost:3000';
      const lienAvis = `${baseUrl}/avis/${token}`;
      
      await sendEmail({
        to: client.email,
        subject: `Votre avis sur notre intervention - ${artisan.nomEntreprise || 'Artisan'}`,
        body: `
          <h2>Bonjour ${client.nom},</h2>
          <p>Suite à notre intervention du ${new Date(intervention.dateDebut).toLocaleDateString('fr-FR')}, nous aimerions connaître votre avis.</p>
          <p>Votre retour est précieux et nous aide à améliorer nos services.</p>
          <p><a href="${lienAvis}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Donner mon avis</a></p>
          <p>Ce lien est valable pendant 14 jours.</p>
          <p>Merci de votre confiance,<br>${artisan.nomEntreprise || 'Votre artisan'}</p>
        `,
      });
      
      return demande;
    }),

  // Répondre à un avis
  repondre: protectedProcedure
    .input(z.object({
      avisId: z.number(),
      reponse: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const avis = await db.getAvisById(input.avisId);
      if (!avis || avis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Avis non trouvé" });
      }
      
      return await db.updateAvis(input.avisId, {
        reponseArtisan: input.reponse,
        reponseAt: new Date(),
      });
    }),

  // Modérer un avis (masquer/publier)
  moderer: protectedProcedure
    .input(z.object({
      avisId: z.number(),
      statut: z.enum(["publie", "masque"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      
      const avis = await db.getAvisById(input.avisId);
      if (!avis || avis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Avis non trouvé" });
      }
      
      return await db.updateAvis(input.avisId, { statut: input.statut });
    }),

  // Page publique - soumettre un avis
  submitAvis: publicProcedure
    .input(z.object({
      token: z.string(),
      note: z.number().min(1).max(5),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const demande = await db.getDemandeAvisByToken(input.token);
      if (!demande) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Demande d'avis non trouvée" });
      }
      
      if (demande.statut === 'completee') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vous avez déjà donné votre avis" });
      }
      
      if (new Date() > new Date(demande.expiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien a expiré" });
      }
      
      // Créer l'avis
      const avis = await db.createAvis({
        artisanId: demande.artisanId,
        clientId: demande.clientId,
        interventionId: demande.interventionId,
        note: input.note,
        commentaire: input.commentaire,
        tokenAvis: crypto.randomUUID(),
        statut: 'publie',
      });
      
      // Mettre à jour la demande
      await db.updateDemandeAvis(demande.id, {
        statut: 'completee',
        avisRecuAt: new Date(),
      });
      
      // Notifier l'artisan
      const artisan = await db.getArtisanById(demande.artisanId);
      if (artisan) {
        await db.createNotification({
          artisanId: artisan.id,
          type: 'info',
          titre: 'Nouvel avis client',
          message: `Un client a laissé un avis ${input.note}/5`,
        });
      }
      
      return { success: true };
    }),

  // Page publique - récupérer les infos de la demande d'avis
  getDemandeInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const demande = await db.getDemandeAvisByToken(input.token);
      if (!demande) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Demande d'avis non trouvée" });
      }
      
      const artisan = await db.getArtisanById(demande.artisanId);
      const client = await db.getClientById(demande.clientId);
      const intervention = await db.getInterventionById(demande.interventionId);
      
      return {
        demande,
        artisan: artisan ? { nomEntreprise: artisan.nomEntreprise } : null,
        client: client ? { nom: client.nom } : null,
        intervention: intervention ? { 
          titre: intervention.titre,
          dateDebut: intervention.dateDebut,
        } : null,
        isExpired: new Date() > new Date(demande.expiresAt),
        isCompleted: demande.statut === 'completee',
      };
    }),
});

// ============================================================================
// MAIN APP ROUTER
// ============================================================================
// ============================================================================
// GEOLOCALISATION ROUTER
// ============================================================================
const geolocalisationRouter = router({
  updatePosition: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      latitude: z.string(),
      longitude: z.string(),
      precision: z.number().optional(),
      vitesse: z.string().optional(),
      cap: z.number().optional(),
      batterie: z.number().optional(),
      enDeplacement: z.boolean().optional(),
      interventionEnCoursId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.updatePositionTechnicien(input);
    }),

  getPositions: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAllTechniciensPositions(artisan.id);
  }),

  getLastPosition: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ input }) => {
      return await db.getLastPositionByTechnicienId(input.technicienId);
    }),

  getHistorique: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ input }) => {
      return await db.getPositionsHistorique(input.technicienId, input.dateDebut, input.dateFin);
    }),

  getStatistiquesDeplacements: protectedProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { totalKm: 0, totalMinutes: 0, nombreDeplacements: 0 };
      return await db.getStatistiquesDeplacements(artisan.id, input.dateDebut, input.dateFin);
    }),

  createHistoriqueDeplacement: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      interventionId: z.number().optional(),
      dateDebut: z.date(),
      dateFin: z.date().optional(),
      distanceKm: z.string().optional(),
      dureeMinutes: z.number().optional(),
      latitudeDepart: z.string().optional(),
      longitudeDepart: z.string().optional(),
      latitudeArrivee: z.string().optional(),
      longitudeArrivee: z.string().optional(),
      adresseDepart: z.string().optional(),
      adresseArrivee: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createHistoriqueDeplacement(input);
    }),

  getHistoriqueDeplacements: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ input }) => {
      return await db.getHistoriqueDeplacementsByTechnicienId(input.technicienId);
    }),
});

// ============================================================================
// COMPTABILITE ROUTER
// ============================================================================
const comptabiliteRouter = router({
  getEcritures: protectedProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getEcrituresComptables(artisan.id, input?.dateDebut, input?.dateFin);
    }),

  getGrandLivre: protectedProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getGrandLivre(artisan.id, input.dateDebut, input.dateFin);
    }),

  getBalance: protectedProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getBalance(artisan.id, input.dateDebut, input.dateFin);
    }),

  getJournalVentes: protectedProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getJournalVentes(artisan.id, input.dateDebut, input.dateFin);
    }),

  getRapportTVA: protectedProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0 };
      return await db.getRapportTVA(artisan.id, input.dateDebut, input.dateFin);
    }),

  genererEcrituresFacture: protectedProcedure
    .input(z.object({ factureId: z.number() }))
    .mutation(async ({ input }) => {
      return await db.genererEcrituresFacture(input.factureId);
    }),

  getPlanComptable: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getPlanComptable(artisan.id);
  }),

  initPlanComptable: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    await db.initPlanComptable(artisan.id);
    return { success: true };
  }),
});

// ============================================================================
// DEVIS OPTIONS ROUTER
// ============================================================================
const devisOptionsRouter = router({
  getByDevisId: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ input }) => {
      return await db.getDevisOptionsByDevisId(input.devisId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getDevisOptionById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      devisId: z.number(),
      nom: z.string(),
      description: z.string().optional(),
      ordre: z.number().optional(),
      recommandee: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createDevisOption(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      description: z.string().optional(),
      ordre: z.number().optional(),
      recommandee: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateDevisOption(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteDevisOption(input.id);
      return { success: true };
    }),

  select: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .mutation(async ({ input }) => {
      return await db.selectDevisOption(input.optionId);
    }),

  convertirEnDevis: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .mutation(async ({ input }) => {
      await db.convertirOptionEnDevis(input.optionId);
      return { success: true };
    }),

  // Lignes d'option
  getLignes: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .query(async ({ input }) => {
      return await db.getDevisOptionLignesByOptionId(input.optionId);
    }),

  createLigne: protectedProcedure
    .input(z.object({
      optionId: z.number(),
      articleId: z.number().optional(),
      designation: z.string(),
      description: z.string().optional(),
      quantite: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string().optional(),
      tauxTVA: z.string().optional(),
      remise: z.string().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const quantite = parseFloat(input.quantite || '1');
      const prixUnitaireHT = parseFloat(input.prixUnitaireHT || '0');
      const tauxTVA = parseFloat(input.tauxTVA || '20');
      const remise = parseFloat(input.remise || '0');
      
      const montantHTBrut = quantite * prixUnitaireHT;
      const montantRemise = montantHTBrut * (remise / 100);
      const montantHT = montantHTBrut - montantRemise;
      const montantTVA = montantHT * (tauxTVA / 100);
      const montantTTC = montantHT + montantTVA;
      
      const ligne = await db.createDevisOptionLigne({
        ...input,
        montantHT: montantHT.toFixed(2),
        montantTVA: montantTVA.toFixed(2),
        montantTTC: montantTTC.toFixed(2),
      });
      
      await db.recalculerTotauxOption(input.optionId);
      return ligne;
    }),

  updateLigne: protectedProcedure
    .input(z.object({
      id: z.number(),
      optionId: z.number(),
      designation: z.string().optional(),
      description: z.string().optional(),
      quantite: z.string().optional(),
      unite: z.string().optional(),
      prixUnitaireHT: z.string().optional(),
      tauxTVA: z.string().optional(),
      remise: z.string().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, optionId, ...data } = input;
      
      if (data.quantite || data.prixUnitaireHT || data.tauxTVA || data.remise) {
        const quantite = parseFloat(data.quantite || '1');
        const prixUnitaireHT = parseFloat(data.prixUnitaireHT || '0');
        const tauxTVA = parseFloat(data.tauxTVA || '20');
        const remise = parseFloat(data.remise || '0');
        
        const montantHTBrut = quantite * prixUnitaireHT;
        const montantRemise = montantHTBrut * (remise / 100);
        const montantHT = montantHTBrut - montantRemise;
        const montantTVA = montantHT * (tauxTVA / 100);
        const montantTTC = montantHT + montantTVA;
        
        Object.assign(data, {
          montantHT: montantHT.toFixed(2),
          montantTVA: montantTVA.toFixed(2),
          montantTTC: montantTTC.toFixed(2),
        });
      }
      
      const ligne = await db.updateDevisOptionLigne(id, data);
      await db.recalculerTotauxOption(optionId);
      return ligne;
    }),

  deleteLigne: protectedProcedure
    .input(z.object({ id: z.number(), optionId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteDevisOptionLigne(input.id);
      await db.recalculerTotauxOption(input.optionId);
      return { success: true };
    }),
});

// ============================================================================
// RAPPORTS PERSONNALISABLES ROUTER
// ============================================================================
const rapportsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getRapportsPersonnalisesByArtisanId(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getRapportPersonnaliseById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      nom: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["ventes", "clients", "interventions", "stocks", "fournisseurs", "techniciens", "financier"]),
      filtres: z.record(z.string(), z.unknown()).optional(),
      colonnes: z.array(z.string()).optional(),
      groupement: z.string().optional(),
      tri: z.string().optional(),
      format: z.enum(["tableau", "graphique", "liste"]).optional(),
      graphiqueType: z.enum(["bar", "line", "pie", "doughnut"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createRapportPersonnalise({
        artisanId: artisan.id,
        ...input,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      description: z.string().optional(),
      filtres: z.record(z.string(), z.unknown()).optional(),
      colonnes: z.array(z.string()).optional(),
      groupement: z.string().optional(),
      tri: z.string().optional(),
      format: z.enum(["tableau", "graphique", "liste"]).optional(),
      graphiqueType: z.enum(["bar", "line", "pie", "doughnut"]).optional(),
      favori: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateRapportPersonnalise(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteRapportPersonnalise(input.id);
      return { success: true };
    }),

  toggleFavori: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.toggleRapportFavori(input.id);
    }),

  executer: protectedProcedure
    .input(z.object({
      rapportId: z.number(),
      parametres: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(async ({ input }) => {
      return await db.executerRapport(input.rapportId, input.parametres);
    }),

  historique: protectedProcedure
    .input(z.object({ rapportId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      return await db.getHistoriqueExecutions(input.rapportId, input.limit);
    }),
});

// ============================================================================
// NOTIFICATIONS PUSH ROUTER
// ============================================================================
const notificationsPushRouter = router({
  subscribe: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.savePushSubscription(input);
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      await db.deletePushSubscription(input.endpoint);
      return { success: true };
    }),

  getPreferences: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPreferencesNotifications(input.technicienId);
    }),

  savePreferences: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      nouvelleAssignation: z.boolean().optional(),
      modificationIntervention: z.boolean().optional(),
      annulationIntervention: z.boolean().optional(),
      rappelIntervention: z.boolean().optional(),
      nouveauMessage: z.boolean().optional(),
      demandeAvis: z.boolean().optional(),
      heureDebutNotif: z.string().optional(),
      heureFinNotif: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.savePreferencesNotifications(input);
    }),

  getHistorique: protectedProcedure
    .input(z.object({ technicienId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      return await db.getHistoriqueNotificationsPush(input.technicienId, input.limit);
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.markNotificationPushAsRead(input.id);
      return { success: true };
    }),

  // Envoyer une notification (pour tests ou envoi manuel)
  send: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      type: z.enum(["assignation", "modification", "annulation", "rappel", "message", "avis"]),
      titre: z.string(),
      corps: z.string().optional(),
      referenceId: z.number().optional(),
      referenceType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Enregistrer dans l'historique
      return await db.createHistoriqueNotificationPush(input);
    }),
});

// ============================================================================
// CONGES ROUTER
// ============================================================================
const congesRouter = router({
  list: protectedProcedure
    .input(z.object({ statut: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.getCongesByArtisan(artisan.id, input.statut);
    }),

  enAttente: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      artisan = await db.createArtisan({ userId: ctx.user.id });
    }
    return await db.getCongesEnAttente(artisan.id);
  }),

  byTechnicien: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ input }) => {
      return await db.getCongesByTechnicien(input.technicienId);
    }),

  byPeriode: protectedProcedure
    .input(z.object({ dateDebut: z.string(), dateFin: z.string() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.getCongesParPeriode(artisan.id, input.dateDebut, input.dateFin);
    }),

  create: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      type: z.enum(["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"]),
      dateDebut: z.string(),
      dateFin: z.string(),
      demiJourneeDebut: z.boolean().optional(),
      demiJourneeFin: z.boolean().optional(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createConge({
        ...input,
        artisanId: artisan.id,
        dateDebut: new Date(input.dateDebut),
        dateFin: new Date(input.dateFin),
      });
    }),

  approuver: protectedProcedure
    .input(z.object({ id: z.number(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conge = await db.getCongeById(input.id);
      if (conge) {
        // Calculer le nombre de jours
        const debut = new Date(conge.dateDebut);
        const fin = new Date(conge.dateFin);
        const diffTime = Math.abs(fin.getTime() - debut.getTime());
        let jours = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (conge.demiJourneeDebut) jours -= 0.5;
        if (conge.demiJourneeFin) jours -= 0.5;
        
        // Mettre à jour le solde si c'est un congé payé ou RTT
        if (conge.type === 'conge_paye' || conge.type === 'rtt') {
          await db.updateSoldeConges(conge.technicienId, conge.type, new Date().getFullYear(), jours);
        }
      }
      return await db.updateCongeStatut(input.id, 'approuve', ctx.user.id, input.commentaire);
    }),

  refuser: protectedProcedure
    .input(z.object({ id: z.number(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return await db.updateCongeStatut(input.id, 'refuse', ctx.user.id, input.commentaire);
    }),

  annuler: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await db.updateCongeStatut(input.id, 'annule', ctx.user.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteConge(input.id);
      return { success: true };
    }),

  getSoldes: protectedProcedure
    .input(z.object({ technicienId: z.number(), annee: z.number() }))
    .query(async ({ input }) => {
      return await db.getSoldesConges(input.technicienId, input.annee);
    }),

  initSolde: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      type: z.enum(["conge_paye", "rtt"]),
      annee: z.number(),
      soldeInitial: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.initSoldeConges({
        ...input,
        artisanId: artisan.id,
        soldeRestant: input.soldeInitial,
      });
    }),
});

// ============================================================================
// PREVISIONS CA ROUTER
// ============================================================================
const previsionsRouter = router({
  getHistorique: protectedProcedure
    .input(z.object({ nombreMois: z.number().default(24) }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.getHistoriqueCA(artisan.id, input.nombreMois);
    }),

  calculerHistorique: protectedProcedure.mutation(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      artisan = await db.createArtisan({ userId: ctx.user.id });
    }
    await db.calculerHistoriqueCAMensuel(artisan.id);
    return { success: true };
  }),

  getPrevisions: protectedProcedure
    .input(z.object({ annee: z.number() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.getPrevisionsCA(artisan.id, input.annee);
    }),

  calculer: protectedProcedure
    .input(z.object({ methode: z.enum(["moyenne_mobile", "regression_lineaire", "saisonnalite"]).default("moyenne_mobile") }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      // D'abord mettre à jour l'historique
      await db.calculerHistoriqueCAMensuel(artisan.id);
      // Puis calculer les prévisions
      return await db.calculerPrevisionsCA(artisan.id, input.methode);
    }),

  getComparaison: protectedProcedure
    .input(z.object({ annee: z.number() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.getComparaisonPrevisionsRealise(artisan.id, input.annee);
    }),

  savePrevisionManuelle: protectedProcedure
    .input(z.object({
      mois: z.number(),
      annee: z.number(),
      caPrevisionnel: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.savePrevisionCA({
        artisanId: artisan.id,
        mois: input.mois,
        annee: input.annee,
        caPrevisionnel: input.caPrevisionnel,
        methodeCalcul: 'manuel',
      });
    }),
});

// ============================================================================
// VEHICULES ROUTER
// ============================================================================
const vehiculesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      artisan = await db.createArtisan({ userId: ctx.user.id });
    }
    return await db.getVehiculesByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getVehiculeById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      immatriculation: z.string(),
      marque: z.string().optional(),
      modele: z.string().optional(),
      annee: z.number().optional(),
      typeCarburant: z.enum(["essence", "diesel", "electrique", "hybride", "gpl"]).optional(),
      kilometrageActuel: z.number().optional(),
      dateAchat: z.string().optional(),
      prixAchat: z.string().optional(),
      technicienId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createVehicule({
        artisanId: artisan.id,
        ...input,
        dateAchat: input.dateAchat ? new Date(input.dateAchat) : undefined,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      immatriculation: z.string().optional(),
      marque: z.string().optional(),
      modele: z.string().optional(),
      annee: z.number().optional(),
      typeCarburant: z.enum(["essence", "diesel", "electrique", "hybride", "gpl"]).optional(),
      kilometrageActuel: z.number().optional(),
      technicienId: z.number().nullable().optional(),
      statut: z.enum(["actif", "en_maintenance", "hors_service", "vendu"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateVehicule(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.deleteVehicule(input.id);
    }),

  addKilometrage: protectedProcedure
    .input(z.object({
      vehiculeId: z.number(),
      kilometrage: z.number(),
      dateReleve: z.string(),
      motif: z.string().optional(),
      technicienId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.addHistoriqueKilometrage({
        ...input,
        dateReleve: new Date(input.dateReleve),
      });
    }),

  getHistoriqueKilometrage: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ input }) => {
      return await db.getHistoriqueKilometrageByVehicule(input.vehiculeId);
    }),

  addEntretien: protectedProcedure
    .input(z.object({
      vehiculeId: z.number(),
      type: z.enum(["vidange", "pneus", "freins", "controle_technique", "revision", "reparation", "autre"]),
      dateEntretien: z.string(),
      kilometrageEntretien: z.number().optional(),
      cout: z.string().optional(),
      prestataire: z.string().optional(),
      description: z.string().optional(),
      prochainEntretienKm: z.number().optional(),
      prochainEntretienDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createEntretienVehicule({
        ...input,
        dateEntretien: new Date(input.dateEntretien),
        prochainEntretienDate: input.prochainEntretienDate ? new Date(input.prochainEntretienDate) : undefined,
      });
    }),

  getEntretiens: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ input }) => {
      return await db.getEntretiensByVehicule(input.vehiculeId);
    }),

  getEntretiensAVenir: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getEntretiensAVenir(artisan.id);
  }),

  addAssurance: protectedProcedure
    .input(z.object({
      vehiculeId: z.number(),
      compagnie: z.string(),
      numeroContrat: z.string().optional(),
      typeAssurance: z.enum(["tiers", "tiers_plus", "tous_risques"]).optional(),
      dateDebut: z.string(),
      dateFin: z.string(),
      primeAnnuelle: z.string().optional(),
      franchise: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createAssuranceVehicule({
        ...input,
        dateDebut: new Date(input.dateDebut),
        dateFin: new Date(input.dateFin),
      });
    }),

  getAssurances: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ input }) => {
      return await db.getAssurancesByVehicule(input.vehiculeId);
    }),

  getAssurancesExpirant: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAssurancesExpirant(artisan.id, 30);
  }),

  getStatistiquesFlotte: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return null;
    return await db.getStatistiquesFlotte(artisan.id);
  }),
});

// ============================================================================
// BADGES ET GAMIFICATION ROUTER
// ============================================================================
const badgesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      artisan = await db.createArtisan({ userId: ctx.user.id });
    }
    return await db.getBadgesByArtisan(artisan.id);
  }),

  create: protectedProcedure
    .input(z.object({
      code: z.string(),
      nom: z.string(),
      description: z.string().optional(),
      icone: z.string().optional(),
      couleur: z.string().optional(),
      categorie: z.enum(["interventions", "avis", "ca", "anciennete", "special"]).optional(),
      condition: z.string().optional(),
      seuil: z.number().optional(),
      points: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createBadge({ artisanId: artisan.id, ...input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      description: z.string().optional(),
      icone: z.string().optional(),
      couleur: z.string().optional(),
      seuil: z.number().optional(),
      points: z.number().optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateBadge(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.deleteBadge(input.id);
    }),

  getBadgesTechnicien: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ input }) => {
      return await db.getBadgesTechnicien(input.technicienId);
    }),

  attribuerBadge: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      badgeId: z.number(),
      valeurAtteinte: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.attribuerBadge(input.technicienId, input.badgeId, input.valeurAtteinte);
    }),

  verifierBadges: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.verifierEtAttribuerBadges(input.technicienId, artisan.id);
    }),

  getClassement: protectedProcedure
    .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getClassementTechniciens(artisan.id, input.periode);
    }),

  calculerClassement: protectedProcedure
    .input(z.object({ periode: z.enum(["semaine", "mois", "trimestre", "annee"]) }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.calculerClassement(artisan.id, input.periode);
    }),

  getObjectifsTechnicien: protectedProcedure
    .input(z.object({ technicienId: z.number(), annee: z.number() }))
    .query(async ({ input }) => {
      return await db.getObjectifsTechnicien(input.technicienId, input.annee);
    }),

  createObjectif: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      mois: z.number(),
      annee: z.number(),
      objectifInterventions: z.number().optional(),
      objectifCA: z.string().optional(),
      objectifAvisPositifs: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createObjectifTechnicien({ artisanId: artisan.id, ...input });
    }),
});

// ============================================================================
// CHANTIERS MULTI-INTERVENTIONS ROUTER
// ============================================================================
const chantiersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getChantiersByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getChantierById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      reference: z.string(),
      nom: z.string(),
      description: z.string().optional(),
      adresse: z.string().optional(),
      codePostal: z.string().optional(),
      ville: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFinPrevue: z.string().optional(),
      budgetPrevisionnel: z.string().optional(),
      priorite: z.enum(["basse", "normale", "haute", "urgente"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createChantier({
        artisanId: artisan.id,
        ...input,
        dateDebut: input.dateDebut ? new Date(input.dateDebut) : undefined,
        dateFinPrevue: input.dateFinPrevue ? new Date(input.dateFinPrevue) : undefined,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      description: z.string().optional(),
      statut: z.enum(["planifie", "en_cours", "en_pause", "termine", "annule"]).optional(),
      avancement: z.number().optional(),
      dateFinReelle: z.string().optional(),
      budgetRealise: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, dateFinReelle, ...rest } = input;
      return await db.updateChantier(id, {
        ...rest,
        dateFinReelle: dateFinReelle ? new Date(dateFinReelle) : undefined,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.deleteChantier(input.id);
    }),

  // Phases
  getPhases: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPhasesByChantier(input.chantierId);
    }),

  createPhase: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      nom: z.string(),
      description: z.string().optional(),
      ordre: z.number().optional(),
      dateDebutPrevue: z.string().optional(),
      dateFinPrevue: z.string().optional(),
      budgetPhase: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createPhaseChantier({
        ...input,
        dateDebutPrevue: input.dateDebutPrevue ? new Date(input.dateDebutPrevue) : undefined,
        dateFinPrevue: input.dateFinPrevue ? new Date(input.dateFinPrevue) : undefined,
      });
    }),

  updatePhase: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().optional(),
      statut: z.enum(["a_faire", "en_cours", "termine", "annule"]).optional(),
      avancement: z.number().optional(),
      dateDebutReelle: z.string().optional(),
      dateFinReelle: z.string().optional(),
      coutReel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, dateDebutReelle, dateFinReelle, ...rest } = input;
      return await db.updatePhaseChantier(id, {
        ...rest,
        dateDebutReelle: dateDebutReelle ? new Date(dateDebutReelle) : undefined,
        dateFinReelle: dateFinReelle ? new Date(dateFinReelle) : undefined,
      });
    }),

  deletePhase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.deletePhaseChantier(input.id);
    }),

  // Interventions
  getInterventions: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ input }) => {
      return await db.getInterventionsByChantier(input.chantierId);
    }),

  getAllInterventionsChantier: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAllInterventionsChantier(artisan.id);
  }),

  associerIntervention: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      interventionId: z.number(),
      phaseId: z.number().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.associerInterventionChantier(input);
    }),

  dissocierIntervention: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      interventionId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await db.dissocierInterventionChantier(input.chantierId, input.interventionId);
    }),

  // Documents
  getDocuments: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ input }) => {
      return await db.getDocumentsByChantier(input.chantierId);
    }),

  addDocument: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      nom: z.string(),
      type: z.enum(["plan", "photo", "permis", "contrat", "facture", "autre"]).optional(),
      url: z.string(),
      taille: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.addDocumentChantier(input);
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.deleteDocumentChantier(input.id);
    }),

  // Statistiques
  getStatistiques: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ input }) => {
      return await db.getStatistiquesChantier(input.chantierId);
    }),

  calculerAvancement: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .mutation(async ({ input }) => {
      return await db.calculerAvancementChantier(input.chantierId);
    }),
});

// ============================================================================
// INTEGRATIONS COMPTABLES ROUTER
// ============================================================================
const integrationsComptablesRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return null;
    return await db.getConfigurationComptable(artisan.id);
  }),

  saveConfig: protectedProcedure
    .input(z.object({
      logiciel: z.enum(["sage", "quickbooks", "ciel", "ebp", "autre"]).optional(),
      formatExport: z.enum(["fec", "iif", "qbo", "csv"]).optional(),
      compteVentes: z.string().optional(),
      compteTVACollectee: z.string().optional(),
      compteClients: z.string().optional(),
      compteAchats: z.string().optional(),
      compteTVADeductible: z.string().optional(),
      compteFournisseurs: z.string().optional(),
      compteBanque: z.string().optional(),
      compteCaisse: z.string().optional(),
      journalVentes: z.string().optional(),
      journalAchats: z.string().optional(),
      journalBanque: z.string().optional(),
      prefixeFacture: z.string().optional(),
      prefixeAvoir: z.string().optional(),
      exerciceDebut: z.number().optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.saveConfigurationComptable({ artisanId: artisan.id, ...input });
    }),

  getExports: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getExportsComptables(artisan.id);
  }),

  genererExport: protectedProcedure
    .input(z.object({
      logiciel: z.enum(["sage", "quickbooks", "ciel", "ebp", "autre"]),
      formatExport: z.enum(["fec", "iif", "qbo", "csv"]),
      dateDebut: z.string(),
      dateFin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }

      const dateDebut = new Date(input.dateDebut);
      const dateFin = new Date(input.dateFin);

      // Créer l'enregistrement d'export
      const exportRecord = await db.createExportComptable({
        artisanId: artisan.id,
        logiciel: input.logiciel,
        formatExport: input.formatExport,
        periodeDebut: dateDebut,
        periodeFin: dateFin,
      });

      if (!exportRecord) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur lors de la création de l'export" });
      }

      // Générer le contenu selon le format
      let contenu = '';
      if (input.formatExport === 'fec') {
        contenu = await db.genererExportFEC(artisan.id, dateDebut, dateFin);
      } else if (input.formatExport === 'iif') {
        contenu = await db.genererExportIIF(artisan.id, dateDebut, dateFin);
      }

      // Mettre à jour l'export avec le statut
      await db.updateExportComptable(exportRecord.id, {
        statut: 'termine',
        nombreEcritures: contenu.split('\n').length - 1,
      });

      return { id: exportRecord.id, contenu };
    }),

  // Synchronisation automatique
  saveSyncConfig: protectedProcedure
    .input(z.object({
      syncAutoFactures: z.boolean().optional(),
      syncAutoPaiements: z.boolean().optional(),
      frequenceSync: z.enum(["quotidien", "hebdomadaire", "mensuel", "manuel"]).optional(),
      heureSync: z.string().optional(),
      notifierErreurs: z.boolean().optional(),
      notifierSucces: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.saveSyncConfigComptable({ artisanId: artisan.id, ...input });
    }),

  getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { actif: false };
    const config = await db.getConfigurationComptable(artisan.id);
    return { 
      actif: config?.syncAutoFactures || config?.syncAutoPaiements || false,
      derniereSync: config?.derniereSync,
      prochainSync: config?.prochainSync,
    };
  }),

  getSyncLogs: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getSyncLogsComptables(artisan.id);
  }),

  getPendingItems: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { facturesEnAttente: 0, paiementsEnAttente: 0, erreurs: 0, items: [] };
    return await db.getPendingItemsComptables(artisan.id);
  }),

  lancerSync: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
    }
    return await db.lancerSynchronisationComptable(artisan.id);
  }),

  retrySync: protectedProcedure
    .input(z.object({
      type: z.enum(["facture", "paiement"]),
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.retrySyncItem(artisan.id, input.type, input.id);
    }),
});

// ============================================================================
// DEVIS IA ROUTER
// ============================================================================
const devisIARouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAnalysesPhotosByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const analyse = await db.getAnalysePhotoById(input.id);
      if (!analyse) return null;

      const photos = await db.getPhotosByAnalyse(input.id);
      const resultats = await db.getResultatsAnalyse(input.id);
      
      const resultatsAvecSuggestions = [];
      for (const resultat of resultats) {
        const suggestions = await db.getSuggestionsByResultat(resultat.id);
        resultatsAvecSuggestions.push({ ...resultat, suggestions });
      }

      const devisGenere = await db.getDevisGenereByAnalyse(input.id);

      return { ...analyse, photos, resultats: resultatsAvecSuggestions, devisGenere };
    }),

  createAnalyse: protectedProcedure
    .input(z.object({
      clientId: z.number().optional(),
      titre: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.createAnalysePhoto({ artisanId: artisan.id, ...input });
    }),

  addPhoto: protectedProcedure
    .input(z.object({
      analyseId: z.number(),
      url: z.string(),
      description: z.string().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.addPhotoToAnalyse(input);
    }),

  analyserPhotos: protectedProcedure
    .input(z.object({ analyseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }

      // Mettre à jour le statut
      await db.updateAnalysePhoto(input.analyseId, { statut: 'en_cours' });

      const photos = await db.getPhotosByAnalyse(input.analyseId);
      if (photos.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune photo à analyser" });
      }

      // Importer le LLM pour l'analyse
      const { invokeLLM } = await import("./_core/llm");

      // Préparer les images pour l'analyse
      const imageContents = photos.map(p => ({
        type: "image_url" as const,
        image_url: { url: p.url, detail: "high" as const }
      }));

      // Appeler l'IA pour analyser les photos
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Tu es un expert en bâtiment et travaux. Analyse les photos fournies et identifie les travaux nécessaires.
            Pour chaque type de travaux détecté, fournis:
            - Le type de travaux (ex: plomberie, électricité, peinture, etc.)
            - Une description détaillée des travaux à réaliser
            - Le niveau d'urgence (faible, moyenne, haute, critique)
            - Une liste d'articles/matériaux nécessaires avec quantités estimées et prix approximatifs
            
            Réponds en JSON avec le format:
            {
              "travaux": [
                {
                  "type": "string",
                  "description": "string",
                  "urgence": "faible|moyenne|haute|critique",
                  "confiance": 0-100,
                  "articles": [
                    {
                      "nom": "string",
                      "description": "string",
                      "quantite": number,
                      "unite": "string",
                      "prixEstime": number
                    }
                  ]
                }
              ]
            }`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse ces photos de chantier et identifie les travaux nécessaires:" },
              ...imageContents
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analyse_chantier",
            strict: true,
            schema: {
              type: "object",
              properties: {
                travaux: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      description: { type: "string" },
                      urgence: { type: "string", enum: ["faible", "moyenne", "haute", "critique"] },
                      confiance: { type: "number" },
                      articles: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            nom: { type: "string" },
                            description: { type: "string" },
                            quantite: { type: "number" },
                            unite: { type: "string" },
                            prixEstime: { type: "number" }
                          },
                          required: ["nom", "quantite", "unite", "prixEstime"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["type", "description", "urgence", "confiance", "articles"],
                    additionalProperties: false
                  }
                }
              },
              required: ["travaux"],
              additionalProperties: false
            }
          }
        }
      });

      // Parser la réponse
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      if (!content) {
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur lors de l'analyse IA" });
      }

      const analyseResult = JSON.parse(content);

      // Sauvegarder les résultats
      for (const travail of analyseResult.travaux) {
        const resultat = await db.saveResultatAnalyseIA({
          analyseId: input.analyseId,
          typeTravauxDetecte: travail.type,
          descriptionTravaux: travail.description,
          urgence: travail.urgence,
          confiance: travail.confiance.toString(),
          rawResponse: travail,
        });

        if (resultat) {
          // Sauvegarder les suggestions d'articles
          for (const article of travail.articles) {
            // Chercher si l'article existe dans la bibliothèque
            const articlesExistants = await db.getBibliothequeArticles();
            const articleMatch = articlesExistants.find(a => 
              a.designation.toLowerCase().includes(article.nom.toLowerCase()) ||
              article.nom.toLowerCase().includes(a.designation.toLowerCase())
            );

            await db.saveSuggestionArticleIA({
              resultatId: resultat.id,
              articleId: articleMatch?.id,
              nomArticle: article.nom,
              description: article.description || '',
              quantiteSuggeree: article.quantite.toString(),
              unite: article.unite,
              prixEstime: article.prixEstime.toString(),
              confiance: travail.confiance.toString(),
            });
          }
        }
      }

      // Mettre à jour le statut
      await db.updateAnalysePhoto(input.analyseId, { statut: 'termine' });

      return { success: true, nombreTravaux: analyseResult.travaux.length };
    }),

  updateSuggestion: protectedProcedure
    .input(z.object({
      id: z.number(),
      selectionne: z.boolean().optional(),
      quantiteSuggeree: z.string().optional(),
      prixEstime: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateSuggestionArticle(id, data);
    }),

  genererDevis: protectedProcedure
    .input(z.object({
      analyseId: z.number(),
      clientId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      return await db.creerDevisDepuisAnalyseIA(input.analyseId, input.clientId, artisan.id);
    }),
});

// ============================================================================
// ALERTES PREVISIONS CA ROUTER
// ============================================================================
const alertesPrevisionsRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return null;
    return await db.getConfigAlertePrevision(artisan.id);
  }),

  saveConfig: protectedProcedure
    .input(z.object({
      seuilAlertePositif: z.string().optional(),
      seuilAlerteNegatif: z.string().optional(),
      alerteEmail: z.boolean().optional(),
      alerteSms: z.boolean().optional(),
      emailDestination: z.string().optional(),
      telephoneDestination: z.string().optional(),
      frequenceVerification: z.enum(["quotidien", "hebdomadaire", "mensuel"]).optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        artisan = await db.createArtisan({ userId: ctx.user.id });
      }
      return await db.saveConfigAlertePrevision({ artisanId: artisan.id, ...input });
    }),

  getHistorique: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getHistoriqueAlertesPrevisions(artisan.id);
  }),

  verifierEtEnvoyer: protectedProcedure.mutation(async ({ ctx }) => {
    let artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.verifierEcartsEtEnvoyerAlertes(artisan.id);
  }),
});

// ============================================================================
// MAIN APP ROUTER
// ============================================================================
export const appRouter = router({system: systemRouter,
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
          const token = await createToken({ id: user.id, email: user.email });
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
        const token = await createToken({ id: user.id, email: user.email });
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
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  parametres: parametresRouter,
  signature: signatureRouter,
  stocks: stocksRouter,
  fournisseurs: fournisseursRouter,
  modelesEmail: modelesEmailRouter,
  commandesFournisseurs: commandesFournisseursRouter,
  clientPortal: clientPortalRouter,
  contrats: contratsRouter,
  interventionsMobile: interventionsMobileRouter,
  chat: chatRouter,
  techniciens: techniciensRouter,
  avis: avisRouter,
  geolocalisation: geolocalisationRouter,
  comptabilite: comptabiliteRouter,
  devisOptions: devisOptionsRouter,
  rapports: rapportsRouter,
  notificationsPush: notificationsPushRouter,
  conges: congesRouter,
  previsions: previsionsRouter,
  vehicules: vehiculesRouter,
  badges: badgesRouter,
  alertesPrevisions: alertesPrevisionsRouter,
  chantiers: chantiersRouter,
  integrationsComptables: integrationsComptablesRouter,
  devisIA: devisIARouter,
});

export type AppRouter = typeof appRouter;
