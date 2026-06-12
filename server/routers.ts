
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminOnlyProcedure, router, devisVoirProcedure, devisCreerProcedure, devisSupprimerProcedure, facturesVoirProcedure, facturesCreerProcedure, facturesSupprimerProcedure, comptaVoirProcedure, utilisateursGererProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes, randomInt } from "crypto";
import * as db from "./db";
import * as dbSecure from "./db-secure";
import { createUserWithPassword, authenticateUser, hashPassword } from "./_core/auth";
import { createToken, setAuthCookie, clearAuthCookie } from "./_core/auth-simple";
import { COOKIE_NAME } from "../shared/const";
import { sendEmail, safeHtml, generateDevisEmailContent, generateFactureEmailContent, generateRappelFactureContent, generateRappelInterventionContent } from "./_core/emailService";
import { sendVerificationCode, isTwilioConfigured, isValidPhoneNumber } from "./_core/smsService";
import { ClientInputSchema, ClientSearchSchema, ArticleSearchSchema, DevisInputSchema, FactureInputSchema, InterventionInputSchema, StockInputSchema, FournisseurInputSchema } from "../shared/validation";
import { ROLE_TEMPLATES, ALL_PERMISSIONS } from "../shared/permissions";
import { buildSystemPrompt } from "./_core/assistantContext";
import { getContexteMetier } from "./_core/contexteMetier";

// Helper local : extrait le metier de l'artisan a partir de plusieurs
// sources possibles (champ libre metier custom > specialite enum schema).
function metierFromArtisan(artisan: any): string | null {
  if (!artisan) return null;
  return artisan.metier || artisan.specialite || null;
}

// Helper local : sanitize les messages d'erreur IA pour ne JAMAIS
// remonter de data: URLs base64 (cf. bug iPhone analyse photos T5).
function sanitizeIaError(e: any, fallback = "Erreur IA"): string {
  let msg = String(e?.message || e || fallback);
  msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  msg = msg.replace(/[A-Za-z0-9+/=]{200,}/g, "[…]");
  if (msg.length > 200) msg = msg.slice(0, 200) + "…";
  return msg;
}

// Rate limiter for AI endpoints
const rateLimitMap = new Map<number, { count: number; resetTime: number }>();
// Exporté pour être réutilisé par les endpoints Express IA (index.ts :
// /api/assistant/stream, /api/voice/token) -> budget Gemini partagé par tenant.
export function checkRateLimit(artisanId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(artisanId);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(artisanId, { count: 1, resetTime: now + 3600000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

// OPE-23 — anti SMS-bombing : borne le nombre d'envois de code de signature par
// (signature, téléphone). Public + token-gated, mais sans throttle un même lien
// permettait des envois SMS illimités (coûts Twilio + harcèlement du destinataire).
// Fenêtre généreuse : un signataire légitime envoie 1 code, éventuellement 1-2 renvois.
const smsSendRateMap = new Map<string, { count: number; resetTime: number }>();
function checkSmsSendRate(key: string): boolean {
  const now = Date.now();
  const entry = smsSendRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    smsSendRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// OPE-22 — anti brute-force OTP : borne les tentatives de vérification du code de
// signature par signature. Sans cette garde, un code à 6 chiffres (900K combinaisons,
// expiration 10 min) est énumérable. Fenêtre généreuse : un signataire légitime saisit
// le bon code en 1-2 essais ; au-delà de 10 essais/15 min → 429.
const smsVerifyRateMap = new Map<string, { count: number; resetTime: number }>();
function checkSmsVerifyRate(key: string): boolean {
  const now = Date.now();
  const entry = smsVerifyRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    smsVerifyRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Anti-flood des emails de réinitialisation de mot de passe (par adresse) : sans
// borne, `forgotPassword` (public) permet d'inonder la boîte d'une victime + de
// gonfler les coûts Resend. Fenêtre généreuse : un utilisateur légitime demande 1-2
// réinitialisations. La réponse reste constante (anti-énumération) : au-delà du seuil
// on court-circuite *silencieusement* l'envoi, sans changer la sortie.
const passwordResetRateMap = new Map<string, { count: number; resetTime: number }>();
function checkPasswordResetRate(key: string): boolean {
  const now = Date.now();
  const entry = passwordResetRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    passwordResetRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

// Anti-flood du formulaire de contact public de la vitrine (par IP) : sans borne,
// `submitContact` (public, sans token) permet d'inonder la boîte de l'artisan +
// de gonfler les coûts Resend. Fenêtre généreuse (5 msg / 15 min par IP) : un
// visiteur légitime envoie 1 message ; seul l'abus depuis une même IP est borné
// (des visiteurs distincts ne se bloquent pas mutuellement).
const publicContactRateMap = new Map<string, { count: number; resetTime: number }>();
function checkPublicContactRate(key: string): boolean {
  const now = Date.now();
  const entry = publicContactRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    publicContactRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Throttle des actions ponctuelles du portail client (demande de modification,
// demande de RDV) : token-gated mais envoie un email/crée un enregistrement à
// chaque appel -> un porteur de token (ou un token fuité) pourrait inonder
// l'artisan. Limite généreuse (un client légitime fait 1-2 demandes), clé par
// (artisan, client) pour rester stable malgré une rotation de token. (OPE-24)
const portalActionRateMap = new Map<string, { count: number; resetTime: number }>();
function checkPortalActionRate(key: string): boolean {
  const now = Date.now();
  const entry = portalActionRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    portalActionRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Throttle du formulaire de support (par utilisateur) : `support.contact` envoie un
// email à support@operioz.com à chaque appel -> un compte authentifié pourrait
// inonder la boîte support + gonfler les coûts Resend. Limite généreuse (5 / 15 min
// par user) : un usage légitime fait 1-2 demandes. (classe rate-limit OPE-24)
const supportContactRateMap = new Map<string, { count: number; resetTime: number }>();
function checkSupportContactRate(key: string): boolean {
  const now = Date.now();
  const entry = supportContactRateMap.get(key);
  if (!entry || now > entry.resetTime) {
    supportContactRateMap.set(key, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Validation format IBAN (ISO 13616 + clé de contrôle ISO 7064 MOD-97-10).
// Accepte la valeur vide (champ optionnel / effacé). Normalise espaces et casse
// pour le calcul sans muter la valeur stockée (le formatage utilisateur est conservé).
function isValidIban(value: string | undefined | null): boolean {
  if (!value) return true;
  const s = value.replace(/\s+/g, "").toUpperCase();
  if (s === "") return true;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  // Déplace les 4 premiers caractères en fin, convertit lettres -> chiffres (A=10..Z=35).
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  // MOD-97 par blocs pour rester dans les bornes des nombres JS.
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

// buildSystemPrompt déplacé dans ./_core/assistantContext.ts pour être partagé
// entre la route SSE /api/assistant/stream et les quick actions ci-dessous.

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
      siret: z.string().max(20).optional(),
      nomEntreprise: z.string().max(200).optional(),
      adresse: z.string().max(300).optional(),
      codePostal: z.string().max(10).optional(),
      ville: z.string().max(100).optional(),
      telephone: z.string().max(30).optional(),
      email: z.string().email().max(320).optional(),
      specialite: z.enum(["plomberie", "electricite", "chauffage", "multi-services"]).optional(),
      tauxTVA: z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getArtisanByUserId(ctx.user.id);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Profil artisan déjà existant" });
      }
      return await db.getOrCreateArtisan(ctx.user.id, input);
    }),
  
  updateProfile: protectedProcedure
    .input(z.object({
      // Bornes .max() généreuses : aucune valeur légitime ne les approche (champs au
      // format court) -> behavior-preserving + borne le surface DoS/stockage. `logo`
      // (data-URI base64) est le vecteur clé : par tRPC il contournerait la limite
      // multer 2 Mo de /api/upload-logo, d'où ~3 Mo (≈ image 2,2 Mo).
      siret: z.string().max(20).optional(),
      nomEntreprise: z.string().max(200).optional(),
      adresse: z.string().max(300).optional(),
      codePostal: z.string().max(10).optional(),
      ville: z.string().max(100).optional(),
      telephone: z.string().max(30).optional(),
      email: z.string().email().max(320).optional(),
      specialite: z.enum(["plomberie", "electricite", "chauffage", "multi-services"]).optional(),
      tauxTVA: z.string().max(10).optional(),
      numeroTVA: z.string().max(20).optional(),
      iban: z.string().max(40).optional().refine(isValidIban, { message: "IBAN invalide (format ou clé de contrôle)" }),
      codeAPE: z.string().max(10).optional(),
      // Mentions légales émetteur (OPE-151) — additifs/optionnels.
      formeJuridique: z.enum(["EI", "micro", "EURL", "SARL", "SAS", "SASU", "SA", "autre"]).optional(),
      capitalSocial: z.string().max(20).optional(),
      villeRCS: z.string().max(100).optional(),
      numeroRM: z.string().max(50).optional(),
      logo: z.string().max(3_000_000).optional(),
      slug: z.string().max(100).optional(),
      // T9 : metier libre (12 valeurs cote UI) hors enum drizzle, persiste raw SQL.
      metier: z.string().max(50).optional(),
    }))
   .mutation(async ({ ctx, input }) => {
      let artisan = await db.getArtisanByUserId(ctx.user.id);

      // T9 : metier hors schema.ts, persiste via raw SQL.
      const metierVal = (input as any).metier;
      const drizzleInput: any = { ...input };
      delete drizzleInput.metier;

      const persistMetier = async (id: number) => {
        if (typeof metierVal !== "string") return;
        try {
          await pool.execute(`UPDATE artisans SET metier = ? WHERE id = ?`, [metierVal.trim() || null, id]);
        } catch (e: any) { console.warn("[updateProfile] metier persist:", String(e?.message || e)); }
      };

      if (!artisan) {
        artisan = await db.getOrCreateArtisan(ctx.user.id, drizzleInput);
        if (artisan) {
          await persistMetier(artisan.id);
          if (typeof metierVal === "string") (artisan as any).metier = metierVal.trim() || null;
        }
        return artisan;
      }

      if (drizzleInput.slug) {
        const slug = String(drizzleInput.slug).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 200);
        if (!slug) throw new TRPCError({ code: "BAD_REQUEST", message: "Slug invalide" });
        const available = await db.isSlugAvailable(slug, artisan.id);
        if (!available) throw new TRPCError({ code: "CONFLICT", message: "Ce slug est deja utilise" });
        drizzleInput.slug = slug;
      }

      artisan = await db.updateArtisan(artisan.id, drizzleInput);
      if (artisan) {
        await persistMetier(artisan.id);
        if (typeof metierVal === "string") (artisan as any).metier = metierVal.trim() || null;
      }
      return artisan;
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

  // OPE-144 — encours impayé d'un client (lecture seule). Sert l'alerte non
  // bloquante « client à risque » avant d'émettre un nouveau devis/facture.
  getEncours: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      // Ownership : le client doit appartenir à l'artisan.
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      return await db.getEncoursClient(input.clientId, artisan.id);
    }),

  create: protectedProcedure
    .input(ClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
        // OPE-24 — bornes raisonnables par champ (defense-in-depth) : avec le cap
        // de 5000 lignes, elles bornent la charge mémoire d'un import sans rejeter
        // aucune donnée client légitime (comportement inchangé pour les imports réels).
        nom: z.string().max(200),
        prenom: z.string().max(200).optional(),
        email: z.string().email().max(320).optional(),
        telephone: z.string().max(40).optional(),
        adresse: z.string().max(500).optional(),
        codePostal: z.string().max(20).optional(),
        ville: z.string().max(200).optional(),
        notes: z.string().max(5000).optional(),
      })).max(5000, "Import limité à 5000 clients par envoi"),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);

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

  // Alias list → getBibliotheque
  list: publicProcedure
    .input(z.object({
      metier: z.string().optional(),
      categorie: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await db.getBibliothequeArticles(input?.metier, input?.categorie);
    }),

  search: publicProcedure
    .input(z.object({
      query: z.string().max(200),
      metier: z.string().max(100).optional(),
    }))
    .query(async ({ input }) => {
      return await db.searchArticles(input.query, input.metier);
    }),

  // === Suggestions IA d'articles (T2) ===
  // Quand l'artisan cherche un article qui n'est pas dans sa biblio,
  // l'IA propose 5 articles realistes avec prix marche 2024, adaptes
  // au metier de l'artisan (contexte specialise injecte en prompt).
  suggererArticlesIA: protectedProcedure
    .input(z.object({
      query: z.string().min(2).max(200),
      contexte: z.string().max(2000).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      if (!checkRateLimit(artisan.id)) return [];
      const metier = metierFromArtisan(artisan);
      const contexteMetier = getContexteMetier(metier);

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `L'artisan cherche : "${input.query}"
Contexte : ${input.contexte || "creation de devis"}.

Propose 5 articles pertinents pour un artisan ${metier || "du bâtiment"} en France avec prix realistes marche 2024.

Reponds UNIQUEMENT en JSON pur (pas de markdown, pas de texte autour) :
{"articles":[{"designation":"nom","reference":"REF-XXX","unite":"u|m|m²|ml|kg|L|h","prixUnitaire":0,"description":"courte","categorie":"cat"}]}` }] }],
          config: { systemInstruction: contexteMetier, temperature: 0.4, maxOutputTokens: 1000 },
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];
        const data = JSON.parse(jsonMatch[0]);
        return Array.isArray(data?.articles) ? data.articles : [];
      } catch (e: any) {
        console.warn("[suggererArticlesIA]", sanitizeIaError(e));
        return [];
      }
    }),

  getArtisanArticles: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getArticlesArtisan(artisan.id);
  }),
  
  createArtisanArticle: protectedProcedure
    .input(z.object({
      // Bornes alignées sur les colonnes de `articles_artisan` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      reference: z.string().min(1).max(50),
      designation: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().max(20),
      tauxTVA: z.string().max(10).optional(),
      categorie: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createArticleArtisan({ artisanId: artisan.id, ...input });
    }),

  updateArtisanArticle: protectedProcedure
    .input(z.object({
      id: z.number(),
      reference: z.string().max(50).optional(),
      designation: z.string().max(500).optional(),
      description: z.string().max(5000).optional(),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().max(20).optional(),
      tauxTVA: z.string().max(10).optional(),
      categorie: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : verifier que l'article appartient bien a cet artisan.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const art = artisan ? await db.getArticleArtisanById(input.id) : null;
      if (!art || !artisan || art.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouve" });
      }
      const { id, ...data } = input;
      return await db.updateArticleArtisan(id, data);
    }),

  deleteArtisanArticle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : verifier ownership avant suppression.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const art = artisan ? await db.getArticleArtisanById(input.id) : null;
      if (!art || !artisan || art.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouve" });
      }
      await db.deleteArticleArtisan(input.id);
      return { success: true };
    }),

  // CRUD Bibliothèque d'articles
  // SECURITE : la bibliotheque est PARTAGEE entre tous les artisans (en
  // lecture). Les mutations sont donc reservees aux admins Operioz pour
  // ne pas qu'un artisan pollue/efface les articles vus par les autres.
  createBibliothequeArticle: adminOnlyProcedure
    .input(z.object({
      nom: z.string().min(1).max(255),
      description: z.string().optional(),
      unite: z.string().max(50),
      prix_base: z.string(),
      tauxTVA: z.string().max(10).optional(),
      prixRevient: z.string().max(20).optional(),
      categorie: z.string().max(50),
      sous_categorie: z.string().max(100),
      metier: z.string().max(50),
    }))
    .mutation(async ({ input }) => {
      return await db.createBibliothequeArticle(input);
    }),

  updateBibliothequeArticle: adminOnlyProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().max(255).optional(),
      description: z.string().optional(),
      unite: z.string().max(50).optional(),
      prix_base: z.string().optional(),
      tauxTVA: z.string().max(10).optional(),
      prixRevient: z.string().max(20).optional(),
      categorie: z.string().max(50).optional(),
      sous_categorie: z.string().max(100).optional(),
      metier: z.string().max(50).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await db.updateBibliothequeArticle(id, data);
    }),

  deleteBibliothequeArticle: adminOnlyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteBibliothequeArticle(input.id);
      return { success: true };
    }),

  // OPE-181 — admin-only (aligné sur create/update/deleteBibliothequeArticle) : la
  // bibliothèque est un catalogue GLOBAL servi à tous les tenants, ses écritures sont
  // réservées aux admins Operioz. Auparavant `protectedProcedure` → un artisan/collaborateur
  // pouvait polluer le catalogue vu par tous (bypass de l'admin-only du create unitaire) et
  // déclencher un DoS via un array non borné. + `.max(2000)` (defense-in-depth).
  importBibliothequeArticles: adminOnlyProcedure
    .input(z.array(z.object({
      nom: z.string().max(255),
      description: z.string().max(5000).optional(),
      unite: z.string().max(50),
      prix_base: z.string().max(20),
      categorie: z.string().max(50),
      sous_categorie: z.string().max(100),
      metier: z.string().max(50),
    })).max(2000, "Import limité à 2000 articles par envoi"))
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
  // === Conseiller IA Dashboard (T7) — 3 conseils du jour ===
  // Genere 3 conseils personnalises bases sur les devis en attente,
  // factures impayees, stocks, periode de l'annee, et metier. Cache
  // 4h cote client (staleTime) pour eviter de bruler le quota Claude.
  conseilsIA: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { conseils: [] };
    if (!checkRateLimit(artisan.id)) return { conseils: [] };

    const metier = metierFromArtisan(artisan);
    const contexteMetier = getContexteMetier(metier);

    // Stats minimales pour personnaliser le prompt.
    let nbDevisEnAttente = 0;
    let nbFacturesImpayees = 0;
    let montantImpayees = 0;
    let nbStocksBas = 0;
    try {
      const stats = await db.getDashboardStats(artisan.id);
      nbDevisEnAttente = stats?.devisEnCours || 0;
      nbFacturesImpayees = stats?.facturesImpayees?.count || 0;
      montantImpayees = Number(stats?.facturesImpayees?.total || 0);
      const stocksBas = await db.getLowStockItems(artisan.id);
      nbStocksBas = stocksBas.length;
    } catch {/* ok */}

    const moisLabel = new Date().toLocaleDateString("fr-FR", { month: "long" });

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Tu es le conseiller IA d'Operioz pour ${artisan.nomEntreprise || "cet artisan"} (${metier || "batiment"}).

Etat actuel :
- ${nbDevisEnAttente} devis en attente de reponse
- ${nbFacturesImpayees} factures impayees (${montantImpayees.toFixed(0)} EUR)
- ${nbStocksBas} articles en stock bas
- Mois en cours : ${moisLabel}

Donne 3 conseils personnalises ET actionnables (pas de generalites). Chaque conseil a un titre court, un message en 1-2 phrases, une action concrete avec un lien interne d'Operioz, et un icone emoji.

Liens disponibles : /devis, /factures, /relances, /clients, /interventions, /stocks, /tableau-bord-depenses, /alertes-previsions, /depenses, /budgets-depenses.

Reponds UNIQUEMENT en JSON pur :
{"conseils":[{"icone":"💡","titre":"court","message":"phrase","actionLabel":"texte bouton","actionLien":"/devis"}]}` }] }],
        config: { systemInstruction: contexteMetier, temperature: 0.6, maxOutputTokens: 800 },
      });
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { conseils: [] };
      const data = JSON.parse(jsonMatch[0]);
      return {
        conseils: Array.isArray(data.conseils) ? data.conseils.slice(0, 3) : [],
        genereLe: new Date().toISOString(),
      };
    } catch (e: any) {
      console.warn("[conseilsIA]", sanitizeIaError(e));
      return { conseils: [] };
    }
  }),

  // === Generation IA des lignes de devis depuis une description (T3) ===
  // L'artisan decrit un chantier en texte libre (+ surface/budget
  // optionnels) ; l'IA renvoie objet + lignes pre-remplies + conseils
  // adapte au metier. Pas de persistance auto : retourne le brouillon,
  // l'utilisateur valide ensuite avant la creation effective du devis.
  genererLignesIA: protectedProcedure
    .input(z.object({
      description: z.string().min(5).max(5000),
      surface: z.number().optional(),
      budget: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      if (!checkRateLimit(artisan.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });
      }
      const metier = metierFromArtisan(artisan);
      const contexteMetier = getContexteMetier(metier);

      const userPrompt = `Chantier décrit : "${input.description}"
${input.surface ? `Surface : ${input.surface} m²` : ""}
${input.budget ? `Budget client : ${input.budget} €` : ""}

Genere les lignes detaillees d'un devis professionnel.
Inclure main d'oeuvre ET fournitures. Prix realistes marche francais 2024.

Reponds UNIQUEMENT en JSON pur (pas de markdown) :
{"objet":"objet court","dureeEstimee":"X jours","lignes":[{"designation":"description","quantite":1,"unite":"u|m|m²|h|forfait","prixUnitaire":0,"tauxTva":10,"type":"fourniture|main_oeuvre|forfait"}],"notes":"remarques","conseilsArtisan":"conseils"}`;

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: { systemInstruction: contexteMetier, temperature: 0.3, maxOutputTokens: 2500 },
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return { lignes: [], objet: input.description.slice(0, 80) };
        }
        const data = JSON.parse(jsonMatch[0]);
        return {
          objet: data.objet || input.description.slice(0, 80),
          dureeEstimee: data.dureeEstimee || null,
          lignes: Array.isArray(data.lignes) ? data.lignes : [],
          notes: data.notes || null,
          conseilsArtisan: data.conseilsArtisan || null,
        };
      } catch (e: any) {
        console.warn("[genererLignesIA]", sanitizeIaError(e));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Generation IA echouee : ${sanitizeIaError(e)}`,
        });
      }
    }),

  list: devisVoirProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const allDevis = await dbSecure.getDevisByArtisanIdSecure(artisan.id);
      if (!input?.search) return allDevis;
      const q = input.search.toLowerCase();
      // Filtrer par numéro, objet ou nom client
      const filtered = [];
      for (const d of allDevis) {
        if (d.numero?.toLowerCase().includes(q) || d.objet?.toLowerCase().includes(q)) {
          filtered.push(d);
          continue;
        }
        const client = await db.getClientById(d.clientId);
        if (client && `${client.prenom || ''} ${client.nom}`.toLowerCase().includes(q)) {
          filtered.push(d);
        }
      }
      return filtered;
    }),
  
  getById: devisVoirProcedure
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
      const signature = await db.getSignatureByDevisId(devis.id);
      return { ...devis, lignes, client, signatureToken: signature?.token || null };
    }),
  
  create: devisCreerProcedure
    .input(z.object({
      clientId: z.number(),
      // Bornes raisonnables (champs TEXT) : borne le stockage + erreur 400 claire
      // au lieu d'un 500 au-delà de la capacité TEXT. Defense-in-depth (OPE-24).
      objet: z.string().max(500).optional(),
      referenceClient: z.string().max(100).optional(),
      conditionsPaiement: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      dateValidite: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
        referenceClient: input.referenceClient,
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

  update: devisCreerProcedure
    .input(z.object({
      id: z.number(),
      objet: z.string().max(500).optional(),
      referenceClient: z.string().max(100).optional(),
      conditionsPaiement: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
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

  delete: devisSupprimerProcedure
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
      // Bornes texte alignées sur `devis_lignes` (reference 50, designation 500,
      // unite 20) — évite qu'une désignation surdimensionnée fasse échouer toute
      // la création de ligne (erreur/troncature MySQL en mode strict).
      reference: z.string().max(50).optional(),
      designation: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      quantite: z.string().max(20).default("1"),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().max(20),
      tauxTVA: z.string().max(10).default("20.00"),
    }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : verifier l'ownership du devis avant d'ajouter une ligne.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const devisOwned = artisan ? await db.getDevisById(input.devisId) : null;
      if (!devisOwned || !artisan || devisOwned.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouve" });
      }

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
      reference: z.string().max(50).optional(),
      designation: z.string().max(500).optional(),
      description: z.string().max(5000).optional(),
      quantite: z.string().max(20).optional(),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().max(20).optional(),
      tauxTVA: z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : ownership du devis parent.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const devisOwned = artisan ? await db.getDevisById(input.devisId) : null;
      if (!devisOwned || !artisan || devisOwned.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouve" });
      }

      // SECURITE (OPE-9) : la ligne doit appartenir au devis vérifié (sinon update
      // cross-tenant via une ligne d'un autre devis découplée du parent).
      const lignesOwned = await db.getLignesDevisByDevisId(input.devisId);
      if (!lignesOwned.some((l) => l.id === input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ligne non trouvée" });
      }

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
    .mutation(async ({ ctx, input }) => {
      // SECURITE : ownership du devis parent.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const devisOwned = artisan ? await db.getDevisById(input.devisId) : null;
      if (!devisOwned || !artisan || devisOwned.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouve" });
      }
      // SECURITE (OPE-9) : la ligne doit appartenir au devis vérifié.
      const lignesOwned = await db.getLignesDevisByDevisId(input.devisId);
      if (!lignesOwned.some((l) => l.id === input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ligne non trouvée" });
      }
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
        ? body.replace('</body>', `<div style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;margin:0 40px;padding-top:16px;">${safeHtml(input.customMessage)}</div></body>`)
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

      // Créer un nouveau devis avec les mêmes informations.
      // Signature : createDevis(artisanId, data) — 2 args positionnels,
      // PAS un seul objet. L'ancien code passait un objet unique, donc
      // artisanId recevait l'objet et data devenait undefined -> INSERT
      // pete sur les colonnes NOT NULL.
      const numero = await db.getNextDevisNumber(artisan.id);
      const dateValidite = new Date();
      dateValidite.setDate(dateValidite.getDate() + 30);
      const newDevis = await db.createDevis(artisan.id, {
        clientId: devis.clientId,
        numero,
        objet: devis.objet ? `${devis.objet} (copie)` : "(copie)",
        conditionsPaiement: devis.conditionsPaiement || undefined,
        notes: devis.notes || undefined,
        statut: "brouillon",
        dateValidite,
      });

      // Copier les lignes du devis original
      const lignes = await db.getLignesDevisByDevisId(devis.id);
      for (const ligne of lignes) {
        await db.createLigneDevis({
          devisId: newDevis.id,
          ordre: ligne.ordre ?? 0,
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
      const joursMinimum = input.joursMinimum || 7;
      const allDevis = await db.getDevisNonSignes(artisan.id);

      const results = [];
      for (const d of allDevis) {
        const joursDepuisCreation = Math.floor((Date.now() - new Date(d.dateDevis).getTime()) / (1000 * 60 * 60 * 24));
        if (joursDepuisCreation < joursMinimum) continue;

        const client = await db.getClientById(d.clientId);
        const signature = await db.getSignatureByDevisId(d.id);

        results.push({
          devis: {
            id: d.id,
            numero: d.numero,
            dateDevis: d.dateDevis,
            totalTTC: d.totalTTC,
            statut: d.statut,
          },
          client: client ? { id: client.id, nom: `${client.prenom || ''} ${client.nom}`.trim(), email: client.email } : null,
          signature: signature ? { id: signature.id, token: signature.token, createdAt: signature.createdAt } : null,
          joursDepuisCreation,
          joursDepuisEnvoi: signature ? Math.floor((Date.now() - new Date(signature.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : null,
        });
      }
      return results;
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
          <p>${safeHtml(messageRelance)}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #7f8c8d; font-size: 12px;">
            ${safeHtml(artisan.nomEntreprise || '')}<br>
            ${safeHtml(artisan.adresse || '')}<br>
            ${safeHtml(artisan.codePostal || '')} ${safeHtml(artisan.ville || '')}<br>
            ${safeHtml(artisan.telephone || '')}
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
        statut: emailResult.success ? "envoye" : "echec"
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
      
      const devisNonSignes = await db.getDevisNonSignes(artisan.id);
      let relancesEnvoyees = 0;

      for (const d of devisNonSignes) {
        // Filtrer par ancienneté minimum
        const joursDepuisCreation = Math.floor((Date.now() - new Date(d.dateDevis).getTime()) / (1000 * 60 * 60 * 24));
        if (joursDepuisCreation < joursMinimum) continue;

        // Vérifier si une relance a déjà été envoyée récemment
        const derniereRelance = await db.getLastRelanceDate(d.id);
        if (derniereRelance) {
          const joursDepuisRelance = Math.floor((Date.now() - derniereRelance.getTime()) / (1000 * 60 * 60 * 24));
          if (joursDepuisRelance < joursEntreRelances) {
            continue;
          }
        }

        // Récupérer le client et vérifier qu'il a un email
        const client = await db.getClientById(d.clientId);
        if (!client?.email) continue;

        const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
        const artisanName = artisan.nomEntreprise || 'Votre artisan';
        const messageRelance = `Bonjour ${clientName},\n\nNous vous rappelons que le devis n°${d.numero} est toujours en attente de votre signature.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${artisanName}`;

        const emailResult = await sendEmail({
          to: client.email,
          subject: `Relance - Devis n°${d.numero}`,
          body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Relance - Devis n°${d.numero}</h2>
            <p>${safeHtml(messageRelance)}</p>
          </div>`
        });

        await db.createRelanceDevis({
          devisId: d.id,
          artisanId: artisan.id,
          type: "email",
          destinataire: client.email,
          message: messageRelance,
          statut: emailResult.success ? "envoye" : "echec"
        });

        if (emailResult.success) relancesEnvoyees++;
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
      nom: z.string().min(1).max(255),
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
      // Bornes texte alignées sur `modeles_devis_lignes` (designation 255, unite 20)
      // — évite qu'une désignation surdimensionnée fasse échouer l'ajout (MySQL strict).
      designation: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      quantite: z.number().default(1),
      unite: z.string().max(20).default("unité"),
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
  list: facturesVoirProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    // Utiliser la version sécurisée
    return await dbSecure.getFacturesByArtisanIdSecure(artisan.id);
  }),

  getById: facturesVoirProcedure
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
  
  create: facturesCreerProcedure
    .input(z.object({
      clientId: z.number(),
      // Bornes raisonnables (champs TEXT) : borne le stockage + 400 clair au lieu d'un
      // 500 au-delà de la capacité TEXT. Defense-in-depth, idem devis (OPE-24).
      objet: z.string().max(500).optional(),
      referenceClient: z.string().max(100).optional(),
      conditionsPaiement: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      dateEcheance: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      const numero = await db.getNextFactureNumber(artisan.id);
      // OPE-94 — si pas d'échéance saisie, la dériver du délai de paiement par défaut
      // de l'artisan (si configuré). Sinon undefined (comportement inchangé).
      const dateFacture = new Date();
      const dateEcheance = input.dateEcheance
        ? new Date(input.dateEcheance)
        : await db.defaultDateEcheance(artisan.id, dateFacture);
      // Utiliser la version sécurisée (créer une fonction si nécessaire)
      const newFacture = await db.createFacture(artisan.id, {
        clientId: input.clientId,
        numero,
        objet: input.objet,
        referenceClient: input.referenceClient,
        conditionsPaiement: input.conditionsPaiement,
        notes: input.notes,
        dateEcheance,
        statut: "brouillon",
        dateFacture,
        totalHT: "0.00",
        totalTVA: "0.00",
        totalTTC: "0.00",
      });
      await db.createAuditLog({
        artisanId: artisan.id,
        userId: ctx.user.id,
        entityType: "facture",
        entityId: newFacture.id,
        action: "creation",
        details: `Création de la facture ${numero}`,
      });
      return newFacture;
    }),
  
  update: facturesCreerProcedure
    .input(z.object({
      id: z.number(),
      objet: z.string().max(500).optional(),
      referenceClient: z.string().max(100).optional(),
      conditionsPaiement: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      dateEcheance: z.string().optional(),
      statut: z.enum(["brouillon", "validee", "envoyee", "payee", "en_retard", "annulee"]).optional(),
      montantPaye: z.string().optional(),
      datePaiement: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateEcheance, datePaiement, statut, ...data } = input;
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const facture = await dbSecure.getFactureByIdSecure(id, artisan.id);
      if (!facture) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }

      const currentStatut = facture.statut || "brouillon";
      const isLocked = currentStatut !== "brouillon";

      // Si la facture est verrouillée, seul le changement de statut est autorisé (et dans le bon sens)
      if (isLocked) {
        const hasContentChanges = data.objet !== undefined || data.referenceClient !== undefined || data.conditionsPaiement !== undefined || data.notes !== undefined || dateEcheance !== undefined;
        if (hasContentChanges) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Document fiscal verrouillé — modification interdite. Émettez un avoir pour corriger." });
        }
      }

      // Validation des transitions de statut autorisées
      if (statut) {
        const allowedTransitions: Record<string, string[]> = {
          brouillon: ["envoyee"],
          envoyee: ["payee", "en_retard"],
          en_retard: ["payee"],
          payee: [],
          annulee: [],
        };
        const allowed = allowedTransitions[currentStatut] || [];
        if (!allowed.includes(statut)) {
          throw new TRPCError({ code: "FORBIDDEN", message: `Transition de statut non autorisée: ${currentStatut} → ${statut}` });
        }
      }

      const updateData: any = {};
      if (!isLocked) {
        if (data.objet !== undefined) updateData.objet = data.objet;
        if (data.conditionsPaiement !== undefined) updateData.conditionsPaiement = data.conditionsPaiement;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (dateEcheance) updateData.dateEcheance = new Date(dateEcheance);
      }
      if (statut) updateData.statut = statut;
      if (datePaiement) updateData.datePaiement = new Date(datePaiement);
      if (data.montantPaye !== undefined) updateData.montantPaye = data.montantPaye;

      const result = await db.updateFacture(id, updateData);

      // Audit log
      if (statut) {
        await db.createAuditLog({
          artisanId: artisan.id,
          userId: ctx.user.id,
          entityType: "facture",
          entityId: id,
          action: `statut_${statut}`,
          details: `Changement de statut: ${currentStatut} → ${statut}`,
        });
      }

      return result;
    }),

  delete: facturesSupprimerProcedure
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
      // Seuls les brouillons peuvent être supprimés (conformité fiscale)
      if (facture.statut !== "brouillon") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Un document fiscal validé ne peut pas être supprimé. Émettez un avoir pour l'annuler." });
      }
      await db.deleteFacture(input.id);
      await db.createAuditLog({
        artisanId: artisan.id,
        userId: ctx.user.id,
        entityType: "facture",
        entityId: input.id,
        action: "suppression_brouillon",
        details: `Suppression du brouillon ${facture.numero}`,
      });
      return { success: true };
    }),
  
  addLigne: protectedProcedure
    .input(z.object({
      factureId: z.number(),
      // Bornes texte alignées sur `factures_lignes` (reference 50, designation 500,
      // unite 20) — symétrique des lignes de devis ; évite qu'une désignation
      // surdimensionnée fasse échouer l'ajout (erreur/troncature MySQL strict).
      reference: z.string().max(50).optional(),
      designation: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      quantite: z.string().max(20).default("1"),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().max(20),
      tauxTVA: z.string().max(10).default("20.00"),
    }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : ownership de la facture + check brouillon (conformite fiscale).
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      const factureCheck = artisan ? await db.getFactureById(input.factureId) : null;
      if (!factureCheck || !artisan || factureCheck.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvee" });
      }
      if (factureCheck.statut !== "brouillon") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Document fiscal verrouillé — impossible d'ajouter des lignes." });
      }
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
      const result = await db.updateFacture(input.id, {
        montantPaye: input.montantPaye,
        datePaiement: new Date(input.datePaiement),
        statut: "payee",
      });
      // OPE-52 : générer les écritures comptables (411 Client / 706 Ventes /
      // 44571 TVA collectée) pour que Balance / Grand Livre / Journal des ventes
      // affichent la facture. Idempotent (delete-then-insert par factureId).
      // En try/catch : un échec de génération ne doit jamais casser le paiement.
      try {
        await db.genererEcrituresFacture(input.id);
        // Écritures d'encaissement (journal Banque : 512 / 411 lettré) au paiement.
        await db.genererEcrituresEncaissement(input.id);
      } catch (e: any) {
        console.error(`[Compta] génération écritures (${input.id}) failed:`, e?.message);
      }
      await db.createAuditLog({
        artisanId: artisan.id,
        userId: ctx.user.id,
        entityType: "facture",
        entityId: input.id,
        action: "paiement",
        details: `Paiement de ${input.montantPaye} € enregistré le ${input.datePaiement}`,
      });
      return result;
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
      attachPdf: z.boolean().optional().default(true),
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

      const finalBody = input.customMessage
        ? body.replace('</body>', `<div style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;margin:0 40px;padding-top:16px;">${safeHtml(input.customMessage)}</div></body>`)
        : body;

      // Générer le PDF si demandé
      let attachmentContent: string | undefined;
      if (input.attachPdf) {
        const lignes = await db.getLignesFacturesByFactureId(facture.id);
        const { generateFacturePDF } = await import("./_core/pdfGenerator");
        const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });
        attachmentContent = pdfBuffer.toString("base64");
      }

      const result = await sendEmail({
        to: client.email,
        subject,
        body: finalBody,
        attachmentName: input.attachPdf ? `Facture_${facture.numero}.pdf` : undefined,
        attachmentContent,
      });

      if (result.success) {
        // Ne passer en "envoyee" que depuis brouillon/validee — on ne fait pas
        // régresser un statut "payee"/"en_retard" lors d'un renvoi
        const statutActuel = facture.statut || "brouillon";
        const isFirstSend = statutActuel === "brouillon" || statutActuel === "validee";
        if (isFirstSend) {
          await db.updateFacture(facture.id, { statut: "envoyee" });
        }
        // Créer une notification
        const docLabel = facture.typeDocument === "avoir" ? "Avoir" : "Facture";
        const verbe = isFirstSend ? "envoyé" : "renvoyé";
        await db.createNotification({
          artisanId: artisan.id,
          type: "succes",
          titre: `${docLabel} ${verbe}`,
          message: `${docLabel} ${facture.numero} ${verbe}(e) à ${client.email}`,
          lien: `/factures/${facture.id}`,
        });
        // Audit log
        await db.createAuditLog({
          artisanId: artisan.id,
          userId: ctx.user.id,
          entityType: "facture",
          entityId: facture.id,
          action: isFirstSend ? "envoi_email" : "renvoi_email",
          details: `${docLabel} ${facture.numero} ${verbe}(e) par email à ${client.email}`,
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
      // OPE-67 : ne pas générer de lien de paiement pour une facture brouillon/annulée/payée.
      if (facture.statut === 'brouillon' || facture.statut === 'annulee' || facture.statut === 'payee') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette facture n'est pas payable (brouillon, annulée ou déjà payée)" });
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

  // Émettre un avoir (credit note) sur une facture validée
  createAvoir: facturesCreerProcedure
    .input(z.object({
      factureOrigineId: z.number(),
      lignes: z.array(z.object({
        designation: z.string().max(500),
        description: z.string().max(5000).optional(),
        quantite: z.string(),
        unite: z.string().max(20).optional(),
        prixUnitaireHT: z.string(),
        tauxTVA: z.string().default("20.00"),
      })).max(500, "Trop de lignes (max 500 par avoir)"), // OPE-24 — anti-DoS (boucle d'INSERT)
      objet: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      }
      const factureOrigine = await dbSecure.getFactureByIdSecure(input.factureOrigineId, artisan.id);
      if (!factureOrigine) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture d'origine non trouvée" });
      }
      if (factureOrigine.statut === "brouillon") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Impossible d'émettre un avoir sur un brouillon. Modifiez ou supprimez le brouillon directement." });
      }

      // Vérifier les avoirs déjà émis pour empêcher les doublons
      const avoirsExistants = await db.getAvoirsByFactureId(input.factureOrigineId);
      const factureTotalTTC = parseFloat(factureOrigine.totalTTC as any) || 0;
      const totalCouvert = avoirsExistants.reduce(
        (sum, a) => sum + Math.abs(parseFloat(a.totalTTC as any) || 0),
        0
      );

      // Avoir total déjà émis : un seul avoir couvre intégralement la facture
      const avoirTotal = avoirsExistants.find(
        (a) => Math.abs(Math.abs(parseFloat(a.totalTTC as any) || 0) - factureTotalTTC) < 0.01
      );
      if (avoirTotal) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Un avoir total a déjà été émis sur cette facture (${avoirTotal.numero})`,
        });
      }

      // Solde restant après les avoirs partiels existants
      const soldeRestant = factureTotalTTC - totalCouvert;
      if (soldeRestant <= 0.01) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Le solde de cette facture est entièrement couvert par les avoirs existants",
        });
      }

      // Vérifier le montant du nouvel avoir
      let nouveauMontantTTC = 0;
      for (const ligne of input.lignes) {
        const quantite = Math.abs(parseFloat(ligne.quantite) || 0);
        const prixUnitaireHT = Math.abs(parseFloat(ligne.prixUnitaireHT) || 0);
        const tauxTVA = parseFloat(ligne.tauxTVA) || 0;
        const montantHT = quantite * prixUnitaireHT;
        nouveauMontantTTC += montantHT * (1 + tauxTVA / 100);
      }
      if (nouveauMontantTTC > soldeRestant + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Le montant de l'avoir (${nouveauMontantTTC.toFixed(2)} €) dépasse le solde disponible (${soldeRestant.toFixed(2)} €)`,
        });
      }

      const numero = await db.getNextAvoirNumber(artisan.id);
      const defaultObjet = `Avoir sur facture ${factureOrigine.numero}`;

      const avoir = await db.createFacture(artisan.id, {
        clientId: factureOrigine.clientId,
        numero,
        objet: input.objet || defaultObjet,
        notes: input.notes,
        conditionsPaiement: factureOrigine.conditionsPaiement,
        statut: "validee",
        typeDocument: "avoir",
        factureOrigineId: input.factureOrigineId,
        dateFacture: new Date(),
        totalHT: "0.00",
        totalTVA: "0.00",
        totalTTC: "0.00",
      });

      // Ajouter les lignes (montants négatifs)
      for (const ligne of input.lignes) {
        const quantite = parseFloat(ligne.quantite);
        const prixUnitaireHT = parseFloat(ligne.prixUnitaireHT);
        const tauxTVA = parseFloat(ligne.tauxTVA);
        const montantHT = -(Math.abs(quantite) * Math.abs(prixUnitaireHT));
        const montantTVA = montantHT * (tauxTVA / 100);
        const montantTTC = montantHT + montantTVA;

        await db.createLigneFacture({
          factureId: avoir.id,
          designation: ligne.designation,
          description: ligne.description,
          quantite: String(quantite),
          unite: ligne.unite,
          prixUnitaireHT: String(-Math.abs(prixUnitaireHT)),
          tauxTVA: ligne.tauxTVA,
          montantHT: montantHT.toFixed(2),
          montantTVA: montantTVA.toFixed(2),
          montantTTC: montantTTC.toFixed(2),
        });
      }

      await db.recalculateFactureTotals(avoir.id);

      await db.createAuditLog({
        artisanId: artisan.id,
        userId: ctx.user.id,
        entityType: "facture",
        entityId: avoir.id,
        action: "creation_avoir",
        details: `Avoir ${numero} émis sur facture ${factureOrigine.numero}`,
      });
      // Also log on the original invoice
      await db.createAuditLog({
        artisanId: artisan.id,
        userId: ctx.user.id,
        entityType: "facture",
        entityId: input.factureOrigineId,
        action: "avoir_emis",
        details: `Avoir ${numero} émis sur cette facture`,
      });

      return avoir;
    }),

  // Récupérer les avoirs liés à une facture
  getAvoirsByFacture: facturesVoirProcedure
    .input(z.object({ factureId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const facture = await dbSecure.getFactureByIdSecure(input.factureId, artisan.id);
      if (!facture) return [];
      return await db.getAvoirsByFactureId(input.factureId);
    }),

  // Journal d'audit d'une facture
  getAuditLog: facturesVoirProcedure
    .input(z.object({ factureId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const facture = await dbSecure.getFactureByIdSecure(input.factureId, artisan.id);
      if (!facture) return [];
      return await db.getAuditLogsByEntity("facture", input.factureId);
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
      // Bornes alignées sur les colonnes `interventions` (titre VARCHAR(255)) : évite
      // un ER_DATA_TOO_LONG (500) sur un titre trop long ; TEXT borné en defense-in-depth.
      titre: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      adresse: z.string().max(500).optional(),
      notes: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      // Vérifier que le client appartient à l'artisan
      const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
      }
      // Garde de validité des dates : `new Date("garbage")` -> Invalid Date qui finit dans
      // `interventions.dateDebut` (timestamp NOT NULL) -> 500 MySQL strict. Rejet propre en 400.
      // Behavior-preserving : une date valide (sélecteur front) passe à l'identique.
      const dateDebut = new Date(input.dateDebut);
      if (isNaN(dateDebut.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date de début invalide" });
      }
      let dateFin: Date | undefined;
      if (input.dateFin) {
        dateFin = new Date(input.dateFin);
        if (isNaN(dateFin.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date de fin invalide" });
        }
      }
      return await db.createIntervention({
        artisanId: artisan.id,
        clientId: input.clientId,
        titre: input.titre,
        description: input.description,
        dateDebut,
        dateFin,
        adresse: input.adresse,
        notes: input.notes,
        statut: "planifiee",
      });
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titre: z.string().max(255).optional(),
      description: z.string().max(5000).optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      adresse: z.string().max(500).optional(),
      notes: z.string().max(5000).optional(),
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
      // SECURITE : valider aussi que le technicien appartient bien a cet artisan.
      const tech = await db.getTechnicienById(input.technicienId);
      if (!tech || tech.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Technicien non autorise" });
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
      // Borne alignée sur couleurs_interventions.couleur VARCHAR(20). La valeur est
      // une classe Tailwind (« bg-blue-500 »), pas un hex → pas de regex #RRGGBB ici
      // (casserait l'entrée légitime) ; un simple .max() évite l'ER_DATA_TOO_LONG.
      couleur: z.string().max(20),
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
      // Bornes alignées sur le endpoint unitaire `setCouleurIntervention` et la colonne
      // `couleurs_interventions.couleur` VARCHAR(20) : valeur = classe Tailwind (« bg-blue-500 »),
      // bornée à 20 (sinon ER_DATA_TOO_LONG -> 500). Clés = interventionId numériques (sinon
      // `parseInt` -> NaN inséré). Comportement inchangé pour les entrées légitimes.
      couleurs: z.record(z.string().regex(/^\d+$/), z.string().max(20)),
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
    .input(z.object({
      includeArchived: z.boolean().default(false),
      nonLuesUniquement: z.boolean().default(false),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const page = input?.page || 1;
      const limit = input?.limit || 50;
      // Filtre (nonLues) + pagination poussés en SQL (cf. getNotificationsByArtisanId).
      return await db.getNotificationsByArtisanId(artisan.id, input?.includeArchived || false, {
        nonLuesUniquement: input?.nonLuesUniquement || false,
        limit,
        offset: (page - 1) * limit,
      });
    }),
  
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return 0;
    return await db.getUnreadNotificationsCount(artisan.id);
  }),
  
  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : on passe l'artisanId au helper pour forcer WHERE artisanId.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
      await db.markNotificationAsRead(input.id, artisan.id);
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
    .mutation(async ({ ctx, input }) => {
      // SECURITE : ownership enforced cote helper.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
      await db.archiveNotification(input.id, artisan.id);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE : ownership enforced cote helper.
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
      await db.archiveNotification(input.id, artisan.id);
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
        caMonth: 0, caYear: 0, devisEnCours: 0,
        facturesImpayees: { count: 0, total: 0 },
        interventionsAVenir: 0, totalClients: 0,
        totalDevis: 0, totalFactures: 0, totalInterventions: 0,
        // Alias fields for audit compatibility
        chiffreAffaires: 0, devisEnAttente: 0,
      };
    }
    const stats = await db.getDashboardStats(artisan.id);
    return {
      ...stats,
      // Alias fields
      chiffreAffaires: stats.caYear,
      devisEnAttente: stats.devisEnCours,
    };
  }),

  getRecentActivity: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const limit = input?.limit || 10;
      const activities: Array<{ type: string; titre: string; date: Date; id: number }> = [];

      // Derniers devis
      const allDevis = await dbSecure.getDevisByArtisanIdSecure(artisan.id);
      for (const d of allDevis.slice(0, limit)) {
        activities.push({ type: 'devis', titre: `Devis ${d.numero} créé`, date: new Date(d.createdAt), id: d.id });
      }

      // Dernières factures
      const allFactures = await db.getFacturesByArtisanId(artisan.id);
      for (const f of allFactures.slice(0, limit)) {
        activities.push({ type: 'facture', titre: `Facture ${f.numero} ${f.statut === 'payee' ? 'payée' : 'créée'}`, date: new Date(f.createdAt), id: f.id });
      }

      // Dernières interventions
      const allInterventions = await dbSecure.getInterventionsByArtisanIdSecure(artisan.id);
      for (const i of allInterventions.slice(0, limit)) {
        activities.push({ type: 'intervention', titre: `Intervention "${i.titre}" planifiée`, date: new Date(i.createdAt), id: i.id });
      }

      // Derniers clients
      const allClients = await db.getClientsByArtisanId(artisan.id);
      for (const c of allClients.slice(0, limit)) {
        activities.push({ type: 'client', titre: `Client ${c.prenom || ''} ${c.nom} ajouté`, date: new Date(c.createdAt), id: c.id });
      }

      // Trier par date décroissante et limiter
      activities.sort((a, b) => b.date.getTime() - a.date.getTime());
      return activities.slice(0, limit);
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

  getObjectifs: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { objectifCA: 0, currentCA: 0, objectifDevis: 0, currentDevis: 0, objectifClients: 0, currentClients: 0 };
    const params = await db.getParametresArtisan(artisan.id);
    const stats = await db.getDashboardStats(artisan.id);
    // Count devis created this month
    const allDevis = await dbSecure.getDevisByArtisanIdSecure(artisan.id);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const devisThisMonth = allDevis.filter((d: any) => {
      const cd = new Date(d.createdAt);
      return cd.getMonth() === currentMonth && cd.getFullYear() === currentYear;
    }).length;
    // Count clients created this month
    const allClients = await db.getClientsByArtisanId(artisan.id);
    const clientsThisMonth = allClients.filter((c: any) => {
      const cd = new Date(c.createdAt);
      return cd.getMonth() === currentMonth && cd.getFullYear() === currentYear;
    }).length;
    return {
      objectifCA: parseFloat(params?.objectifCA?.toString() || '0'),
      currentCA: stats.caMonth || 0,
      objectifDevis: params?.objectifDevis || 0,
      currentDevis: devisThisMonth,
      objectifClients: params?.objectifClients || 0,
      currentClients: clientsThisMonth,
    };
  }),

  getAlerts: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const alerts: Array<{ type: 'danger' | 'warning' | 'info'; titre: string; message: string; lien?: string }> = [];
    const now = new Date();

    // Factures impayées > 30 jours
    const factures = await db.getFacturesByArtisanId(artisan.id);
    const facturesRetard = factures.filter((f: any) => {
      if (f.statut === 'payee' || f.statut === 'annulee') return false;
      const created = new Date(f.dateEmission || f.createdAt);
      const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
      return diffDays > 30;
    });
    if (facturesRetard.length > 0) {
      const total = facturesRetard.reduce((s: number, f: any) => s + parseFloat(f.totalTTC?.toString() || '0'), 0);
      alerts.push({
        type: 'danger',
        titre: `${facturesRetard.length} facture(s) en retard de +30 jours`,
        message: `Montant total : ${total.toFixed(2)} EUR`,
        lien: '/factures',
      });
    }

    // Devis en attente > 7 jours
    const allDevis = await dbSecure.getDevisByArtisanIdSecure(artisan.id);
    const devisAttente = allDevis.filter((d: any) => {
      if (d.statut !== 'envoye') return false;
      const created = new Date(d.createdAt);
      const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
      return diffDays > 7;
    });
    if (devisAttente.length > 0) {
      alerts.push({
        type: 'warning',
        titre: `${devisAttente.length} devis sans reponse depuis +7 jours`,
        message: `Pensez a relancer vos clients`,
        lien: '/relances',
      });
    }

    // Interventions dans les 48h
    const interventions = await db.getUpcomingInterventions(artisan.id, 10);
    const upcoming48h = interventions.filter((i: any) => {
      const start = new Date(i.dateDebut);
      const diffH = (start.getTime() - now.getTime()) / 3600000;
      return diffH > 0 && diffH <= 48;
    });
    if (upcoming48h.length > 0) {
      alerts.push({
        type: 'info',
        titre: `${upcoming48h.length} intervention(s) dans les 48h`,
        message: upcoming48h.map((i: any) => i.titre).slice(0, 2).join(', '),
        lien: '/interventions',
      });
    }

    return alerts;
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
      
      // Send email to client with signature link
      const client = await db.getClientById(devisData.clientId);
      if (client?.email) {
        const { sendEmail } = await import('./_core/emailService');
        const signatureUrl = `${process.env.APP_URL || 'https://www.operioz.com'}/devis-public/${token}`;
        const artisanName = artisan.nomEntreprise || 'Votre artisan';
        const clientName = `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Client';
        const totalTTC = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(devisData.totalTTC as any) || 0);

        await sendEmail({
          to: client.email,
          subject: `Devis ${devisData.numero} à signer - ${artisanName}`,
          body: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">${safeHtml(artisanName)}</h1>
</td></tr>
<tr><td style="padding:36px 40px 16px 40px;">
<p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Bonjour ${safeHtml(clientName)},</p>
<p style="margin:0 0 24px 0;font-size:15px;color:#374151;">Vous avez reçu le devis <strong>${devisData.numero}</strong>${devisData.objet ? ` pour <em>${safeHtml(devisData.objet)}</em>` : ''} d'un montant de <strong>${totalTTC}</strong>.</p>
<p style="margin:0 0 24px 0;font-size:15px;color:#374151;">Cliquez sur le bouton ci-dessous pour consulter le devis et le signer électroniquement :</p>
</td></tr>
<tr><td style="padding:0 40px 28px 40px;text-align:center;">
<a href="${signatureUrl}" style="display:inline-block;background-color:#1e40af;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:600;">Consulter et signer le devis</a>
</td></tr>
<tr><td style="padding:0 40px 36px 40px;">
<p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">Ce lien est valide pendant 30 jours.</p>
<p style="margin:0;font-size:13px;color:#9ca3af;">Si le bouton ne fonctionne pas, copiez ce lien : ${signatureUrl}</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0;font-size:12px;color:#9ca3af;">Ce message a été envoyé automatiquement depuis Operioz</p>
</td></tr>
</table></td></tr></table></body></html>`
        });
      }

      // Create notification
      await db.createNotification({
        artisanId: artisan.id,
        type: "info",
        titre: "Devis envoyé pour signature",
        message: `Le devis ${devisData.numero} a été envoyé à ${client?.email || 'le client'} pour signature électronique`,
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide ou expiré" });
      }

      if (new Date() > signature.expiresAt && signature.statut === 'en_attente') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien de signature a expiré" });
      }

      const devisData = await db.getDevisById(signature.devisId);
      if (!devisData) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      }

      // OPE-152 — read-receipt : 1ʳᵉ consultation client du devis. Idempotent (no-op
      // si déjà vu) et best-effort (n'altère jamais la réponse en cas d'échec).
      if (!devisData.dateVue) {
        try { await db.markDevisVu(devisData.id); } catch { /* best-effort */ }
      }

      const artisan = await db.getArtisanById(devisData.artisanId);
      const client = await db.getClientById(devisData.clientId);
      const lignes = await db.getLignesDevisByDevisId(devisData.id);

      // OPE-146 — options/variantes du devis (Standard/Premium…) que le client peut
      // CHOISIR avant signature. Chargées avec leurs lignes pour l'affichage portail.
      const optionsRaw = await db.getDevisOptionsByDevisId(devisData.id);
      const options = await Promise.all(optionsRaw.map(async (o) => ({
        ...o,
        lignes: await db.getDevisOptionLignesByOptionId(o.id),
      })));

      return {
        devis: devisData,
        artisan,
        client,
        lignes,
        options,
        signature
      };
    }),

  // OPE-146 — le client sélectionne une option/variante du devis depuis le lien de
  // signature, AVANT de signer. Scopé au devis de la signature + throttlé.
  selectDevisOption: publicProcedure
    .input(z.object({ token: z.string(), optionId: z.number() }))
    .mutation(async ({ input }) => {
      const signature = await db.getSignatureByToken(input.token);
      if (!signature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      if (signature.signedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce devis a déjà été signé" });
      }
      if (new Date() > signature.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien a expiré" });
      }
      // L'option doit appartenir AU devis de cette signature (pas une option d'un autre devis).
      const option = await db.getDevisOptionById(input.optionId);
      if (!option || option.devisId !== signature.devisId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Option non trouvée" });
      }
      // Anti-flood (le porteur du lien pourrait basculer en boucle).
      if (!checkPortalActionRate(`sig:${signature.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de requêtes. Réessayez dans quelques minutes." });
      }
      await db.selectDevisOption(input.optionId);
      return { success: true, optionId: input.optionId };
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

      // OPE-23 — throttle anti SMS-bombing (5 envois / 15 min par signature+téléphone).
      if (!checkSmsSendRate(`${signature.id}:${input.telephone}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes de code. Réessayez dans quelques minutes." });
      }

      // Générer un code à 6 chiffres (OPE-18 — RNG crypto-sûr, non prévisible)
      const code = randomInt(100000, 1000000).toString();
      
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

      // OPE-22 — throttle anti brute-force OTP (10 tentatives / 15 min par signature).
      if (!checkSmsVerifyRate(String(signature.id))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Réessayez dans quelques minutes." });
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
      signatureData: z.string().max(500000), // image base64 d'une signature manuscrite (~500 Ko)
      signataireName: z.string().max(200),
      signataireEmail: z.string().email().max(320),
      smsVerified: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate token
      const existing = await db.getSignatureByToken(input.token);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      if (existing.statut !== 'en_attente') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce devis a déjà été traité" });
      }
      if (new Date() > existing.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien de signature a expiré" });
      }

      // OPE-80 — IP de signature à valeur probante : prioriser CF-Connecting-IP (posé par
      // Cloudflare, non falsifiable) plutôt que X-Forwarded-For[0] (que le signataire peut
      // usurper). On ne garde qu'UNE IP (pas toute la chaîne XFF) — sinon dépassement de
      // signaturesDevis.ipAddress VARCHAR(45) -> ER_DATA_TOO_LONG (500) à la signature.
      const ipAddress = (ctx.req.headers['cf-connecting-ip'] as string)?.trim()
        || (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
        || ctx.req.socket?.remoteAddress
        || 'unknown';
      const userAgent = ctx.req.headers['user-agent'] || 'unknown';

      const signature = await db.signDevis(
        input.token,
        input.signatureData,
        input.signataireName,
        input.signataireEmail,
        ipAddress,
        userAgent
      );

      // Get devis and artisan to create notification + send email
      const devisData = await db.getDevisById(signature.devisId);
      if (devisData) {
        const artisan = await db.getArtisanById(devisData.artisanId);
        await db.createNotification({
          artisanId: devisData.artisanId,
          type: "succes",
          titre: "Devis signé !",
          message: `Le devis ${devisData.numero} a été accepté et signé par ${input.signataireName}`,
          lien: `/devis/${signature.devisId}`
        });
        // Email notification to artisan (fallback to user email if artisan.email not set)
        let artisanEmail = artisan?.email;
        if (!artisanEmail && artisan?.userId) {
          const user = await db.getUserById(artisan.userId);
          artisanEmail = user?.email || null;
        }
        console.log(`[Signature] Artisan notification: artisan.email=${artisan?.email || 'null'}, resolved=${artisanEmail || 'null'}`);
        if (artisanEmail) {
          const { sendEmail } = await import('./_core/emailService');
          await sendEmail({
            to: artisanEmail,
            subject: `Devis ${devisData.numero} accepté et signé`,
            body: `<p>Bonjour,</p><p>Le devis <strong>${devisData.numero}</strong> a été <strong style="color:green">accepté et signé</strong> par <strong>${safeHtml(input.signataireName)}</strong> (${safeHtml(input.signataireEmail)}).</p><p>Connectez-vous à votre espace pour consulter la signature.</p><p style="color:#9ca3af;font-size:12px;">Operioz</p>`
          });
        } else {
          console.warn(`[Signature] No email found for artisan id=${devisData.artisanId} — notification email NOT sent`);
        }
      }

      return { success: true, signature };
    }),

  refuseDevis: publicProcedure
    .input(z.object({
      token: z.string(),
      motifRefus: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate token exists first
      const existing = await db.getSignatureByToken(input.token);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lien de signature invalide" });
      }
      if (existing.statut !== 'en_attente') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce devis a déjà été traité" });
      }

      // OPE-80 — IP de signature à valeur probante : prioriser CF-Connecting-IP (posé par
      // Cloudflare, non falsifiable) plutôt que X-Forwarded-For[0] (que le signataire peut
      // usurper). On ne garde qu'UNE IP (pas toute la chaîne XFF) — sinon dépassement de
      // signaturesDevis.ipAddress VARCHAR(45) -> ER_DATA_TOO_LONG (500) à la signature.
      const ipAddress = (ctx.req.headers['cf-connecting-ip'] as string)?.trim()
        || (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
        || ctx.req.socket?.remoteAddress
        || 'unknown';
      const userAgent = ctx.req.headers['user-agent'] || 'unknown';

      const signature = await db.refuserDevis(
        input.token,
        input.motifRefus,
        ipAddress,
        userAgent
      );

      const devisData = await db.getDevisById(signature.devisId);
      if (devisData) {
        const artisan = await db.getArtisanById(devisData.artisanId);
        const client = await db.getClientById(devisData.clientId);
        const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Le client';
        await db.createNotification({
          artisanId: devisData.artisanId,
          type: "alerte",
          titre: "Devis refusé",
          message: `Le devis ${devisData.numero} a été refusé par ${clientName}${input.motifRefus ? ` — Motif : ${input.motifRefus}` : ''}`,
          lien: `/devis/${signature.devisId}`
        });
        // Email notification to artisan (fallback to user email if artisan.email not set)
        let artisanEmail = artisan?.email;
        if (!artisanEmail && artisan?.userId) {
          const user = await db.getUserById(artisan.userId);
          artisanEmail = user?.email || null;
        }
        if (artisanEmail) {
          const { sendEmail } = await import('./_core/emailService');
          await sendEmail({
            to: artisanEmail,
            subject: `Devis ${devisData.numero} refusé par ${clientName}`,
            body: `<p>Bonjour,</p><p>Le devis <strong>${devisData.numero}</strong> a été <strong style="color:red">refusé</strong> par ${safeHtml(clientName)}.</p>${input.motifRefus ? `<p><strong>Motif :</strong> ${safeHtml(input.motifRefus)}</p>` : ''}<p>Connectez-vous à votre espace pour plus de détails.</p><p style="color:#9ca3af;font-size:12px;">Operioz</p>`
          });
        }
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
      // Bornes alignées sur les colonnes VARCHAR de `stocks` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      // Behavior-preserving : une référence/désignation réelle reste sous ces bornes.
      reference: z.string().max(50),
      designation: z.string().max(500),
      quantiteEnStock: z.string().max(20).optional(),
      seuilAlerte: z.string().max(20).optional(),
      unite: z.string().max(20).optional(),
      prixAchat: z.string().max(20).optional(),
      emplacement: z.string().max(100).optional(),
      fournisseur: z.string().max(255).optional(),
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
      reference: z.string().max(50).optional(),
      designation: z.string().max(500).optional(),
      seuilAlerte: z.string().max(20).optional(),
      unite: z.string().max(20).optional(),
      prixAchat: z.string().max(20).optional(),
      emplacement: z.string().max(100).optional(),
      fournisseur: z.string().max(255).optional()
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
      // Quantité du mouvement bornée >= 0 (le front pose déjà min=0, mais l'API ne
      // l'enforçait pas) : sans cette borne, une quantité NÉGATIVE passée à une `sortie`
      // INVERSE l'opération (`currentQty - (-5)` = +5) et fausse le stock. Borne haute
      // raisonnable contre les saisies aberrantes. Behavior-preserving (mouvements légitimes >= 0).
      quantite: z.number().min(0).max(100_000_000),
      type: z.enum(["entree", "sortie", "ajustement"]),
      motif: z.string().max(255).optional(),
      reference: z.string().max(100).optional()
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
      // Bornes raisonnables (OPE-24) : vitrineZone est VARCHAR(500) -> .max(500) évite un
      // ER_DATA_TOO_LONG (500) ; les champs TEXT sont bornés en defense-in-depth.
      mentionsLegales: z.string().max(5000).optional(),
      conditionsGenerales: z.string().max(10000).optional(),
      notificationsEmail: z.boolean().optional(),
      rappelDevisJours: z.number().optional(),
      rappelFactureJours: z.number().optional(),
      vitrineActive: z.boolean().optional(),
      vitrineDescription: z.string().max(5000).optional(),
      vitrineZone: z.string().max(500).optional(),
      vitrineServices: z.string().max(5000).optional(),
      vitrineExperience: z.number().optional(),
      couleurPrincipale: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      couleurSecondaire: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      conditionsPaiementDefaut: z.string().max(2000).optional(),
      // OPE-94 — délai de paiement structuré (calcul d'échéance des factures).
      delaiPaiementJours: z.number().int().min(0).max(365).nullable().optional(),
      delaiPaiementType: z.enum(["net", "fin_de_mois"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      const updateData = { ...input } as any;
      if (input.vitrineServices !== undefined) {
        const arr = input.vitrineServices.split('\n').map((s: string) => s.trim()).filter(Boolean);
        updateData.vitrineServices = JSON.stringify(arr);
      }
      return await db.updateParametresArtisan(artisan.id, updateData);
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
      // Bornes alignées sur les colonnes de `fournisseurs` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      nom: z.string().max(255),
      contact: z.string().max(255).optional(),
      email: z.string().email().max(320).optional(),
      telephone: z.string().max(20).optional(),
      adresse: z.string().max(500).optional(),
      codePostal: z.string().max(10).optional(),
      ville: z.string().max(100).optional(),
      notes: z.string().max(5000).optional(),
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
      nom: z.string().max(255).optional(),
      contact: z.string().max(255).optional(),
      email: z.string().email().max(320).optional(),
      telephone: z.string().max(20).optional(),
      adresse: z.string().max(500).optional(),
      codePostal: z.string().max(10).optional(),
      ville: z.string().max(100).optional(),
      notes: z.string().max(5000).optional(),
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
  // SECURITE (OPE-90) : les associations sont des données tenant-privées (prix d'achat,
  // références fournisseur). L'ownership se dérive via fournisseurs.artisanId. Sans
  // contrôle, ces routes étaient des IDOR (lecture prix + write/delete cross-tenant).
  getArticleFournisseurs: protectedProcedure
    .input(z.object({ articleId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      // Filtrer aux associations dont le fournisseur appartient à l'artisan.
      const assocs = await db.getArticleFournisseurs(input.articleId);
      if (assocs.length === 0) return assocs;
      const mesFournisseurs = await db.getFournisseursByArtisanId(artisan.id);
      const mesIds = new Set(mesFournisseurs.map((f) => f.id));
      return assocs.filter((a) => mesIds.has(a.fournisseurId));
    }),

  getFournisseurArticles: protectedProcedure
    .input(z.object({ fournisseurId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const fournisseur = await db.getFournisseurById(input.fournisseurId);
      if (!fournisseur || fournisseur.artisanId !== artisan.id) return [];
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
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      // Le fournisseur cible doit appartenir à l'artisan appelant.
      const fournisseur = await db.getFournisseurById(input.fournisseurId);
      if (!fournisseur || fournisseur.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur non trouvé" });
      }
      return await db.createArticleFournisseur(input);
    }),

  dissociateArticle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      // Vérifier que l'association cible un fournisseur de l'artisan avant suppression.
      const assoc = await db.getArticleFournisseurById(input.id);
      if (!assoc) throw new TRPCError({ code: "NOT_FOUND", message: "Association non trouvée" });
      const fournisseur = await db.getFournisseurById(assoc.fournisseurId);
      if (!fournisseur || fournisseur.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Association non trouvée" });
      }
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

  // Modèles transactionnels (envoi_devis, envoi_facture, relance_devis, etc.)
  listTransactionnels: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const all = await db.getModelesEmailByArtisanId(artisan.id);
    const typesTransactionnels = ['envoi_devis', 'envoi_facture', 'relance_devis', 'confirmation_intervention', 'demande_avis', 'portail_client'];
    return all.filter((m: any) => typesTransactionnels.includes(m.type));
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
      // Bornes alignées sur `modeles_email` (nom VARCHAR(100), sujet VARCHAR(255)) ;
      // contenu/variables TEXT bornés en defense-in-depth (OPE-24).
      nom: z.string().max(100),
      type: z.enum(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]),
      sujet: z.string().max(255),
      contenu: z.string().max(10000),
      variables: z.string().max(2000).optional(),
      isDefault: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createModeleEmail({
        artisanId: artisan.id,
        ...input
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().max(100).optional(),
      type: z.enum(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]).optional(),
      sujet: z.string().max(255).optional(),
      contenu: z.string().max(10000).optional(),
      variables: z.string().max(2000).optional(),
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
      // Échappe les métacaractères regex de la clé (nom de variable, contrôlé par
      // l'utilisateur) avant de l'injecter dans `new RegExp` : sans cela une clé
      // malformée (parenthèses déséquilibrées) fait throw -> 500, et une clé piégée
      // (ex. « (a+)+ ») peut provoquer un ReDoS (backtracking catastrophique).
      // Behavior-preserving : un nom de variable normal (« nom », « date ») ne contient
      // aucun métacaractère, l'échappement est alors un no-op.
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const [key, value] of Object.entries(input.variables)) {
        preview = preview.replace(new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g'), value);
      }
      return preview;
    }),
});

// ============================================================================
// COMMANDES FOURNISSEURS ROUTER
// ============================================================================
const commandesFournisseursRouter = router({
  // T8 : liste les devis acceptes pour le selecteur "Generer depuis un devis"
  // dans le formulaire de commande fournisseur. Retourne id/numero/objet/total
  // + nom client pour l'affichage.
  listDevisAcceptes: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const all = await db.getDevisByArtisanId(artisan.id);
    const acceptes = all.filter((d: any) => d.statut === "accepte");
    const result: Array<{ id: number; numero: string; objet: string; clientNom: string; totalTTC: number; dateDevis: string }> = [];
    for (const d of acceptes) {
      let clientNom = "Client";
      try {
        const c = await db.getClientById(d.clientId);
        if (c) clientNom = c.nom + (c.prenom ? " " + c.prenom : "");
      } catch {/* ignore */}
      result.push({
        id: d.id,
        numero: d.numero,
        objet: (d.objet as string) || "",
        clientNom,
        totalTTC: Number(d.totalTTC || 0),
        dateDevis: d.dateDevis ? new Date(d.dateDevis as any).toISOString() : "",
      });
    }
    return result;
  }),

  // T8 : Generation IA d'une commande fournisseur depuis un devis accepte.
  // Analyse les lignes du devis, ajuste selon le stock courant et propose
  // les articles a commander (fournitures uniquement, exclut la main d'oeuvre).
  // Ne cree PAS la commande : retourne juste les lignes pre-remplies.
  genererDepuisDevisIA: protectedProcedure
    .input(z.object({ devisId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      if (!checkRateLimit(artisan.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite IA atteinte" });
      }

      const devis = await db.getDevisById(input.devisId);
      if (!devis || devis.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Devis introuvable" });
      }
      if (devis.statut !== "accepte") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le devis doit etre accepte" });
      }

      const lignesDevis = await db.getLignesDevisByDevisId(devis.id);
      if (lignesDevis.length === 0) {
        return { lignes: [], notes: "Devis sans ligne." };
      }

      // Charge le stock pour l'ajustement quantitatif.
      let stocks: any[] = [];
      try { stocks = await db.getStocksByArtisanId(artisan.id); } catch {/* ok */}
      const stockIndex = new Map<string, { quantite: number; designation: string; articleId: number | null }>();
      for (const s of stocks) {
        const key = (s.designation || "").toLowerCase().trim();
        if (key) {
          stockIndex.set(key, {
            quantite: Number(s.quantiteEnStock || 0),
            designation: s.designation,
            articleId: s.articleType === "artisan" ? s.articleId : null,
          });
        }
      }

      // Charge les articles artisans pour le matching articleId.
      let articlesArtisan: any[] = [];
      try { articlesArtisan = await db.getArticlesArtisan(artisan.id); } catch {/* ok */}

      const metier = metierFromArtisan(artisan);
      const contexteMetier = getContexteMetier(metier);

      const lignesPourPrompt = lignesDevis.map((l: any) => ({
        designation: l.designation,
        quantite: Number(l.quantite || 1),
        unite: l.unite || "u",
        prix: Number(l.prixUnitaireHT || 0),
      }));
      const stockPourPrompt = Array.from(stockIndex.entries()).map(([_, v]) => ({
        designation: v.designation, enStock: v.quantite,
      }));

      const userPrompt = `Devis "${devis.objet || devis.numero}" — lignes :
${JSON.stringify(lignesPourPrompt, null, 2)}

Stock actuel disponible (peut etre vide) :
${JSON.stringify(stockPourPrompt, null, 2)}

Tache : a partir des lignes du devis, deduis la liste des MATERIAUX et FOURNITURES a commander au fournisseur. Exclus strictement la main d'oeuvre et les forfaits intellectuels. Pour chaque fourniture, propose une quantite a commander adaptee aux quantites du devis et au stock disponible. Si une fourniture est deja en stock en quantite suffisante, RETIRE-LA de la liste ou reduis la quantite a 0. Estime le prixUnitaire HT marche francais 2024.

Reponds UNIQUEMENT en JSON pur :
{"lignes":[{"designation":"texte","reference":"","quantite":1,"unite":"u|m|m2|kg|ml","prixUnitaire":0,"tauxTVA":20}],"notes":"remarques optionnelles"}`;

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: { systemInstruction: contexteMetier, temperature: 0.3, maxOutputTokens: 2500 },
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { lignes: [], notes: "" };
        const data = JSON.parse(jsonMatch[0]);

        // Matche les designations IA contre les articles artisans pour
        // pre-remplir articleId quand possible.
        const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
        const ligneOut = (Array.isArray(data.lignes) ? data.lignes : [])
          .filter((l: any) => Number(l.quantite) > 0)
          .map((l: any) => {
            const dnorm = norm(l.designation);
            const match = articlesArtisan.find((a: any) => norm(a.designation) === dnorm)
              || articlesArtisan.find((a: any) => norm(a.designation).includes(dnorm) || dnorm.includes(norm(a.designation)));
            return {
              articleId: match ? match.id : null,
              designation: String(l.designation || "").slice(0, 500),
              reference: match?.reference || String(l.reference || ""),
              quantite: Math.max(0.01, Number(l.quantite) || 1),
              unite: String(l.unite || "u").slice(0, 20),
              prixUnitaire: Number(l.prixUnitaire) || 0,
              tauxTVA: Number(l.tauxTVA) || 20,
            };
          });

        return {
          lignes: ligneOut,
          notes: typeof data.notes === "string" ? data.notes.slice(0, 500) : "",
          devisNumero: devis.numero,
        };
      } catch (e: any) {
        console.warn("[genererDepuisDevisIA]", sanitizeIaError(e));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Generation IA echouee : ${sanitizeIaError(e)}`,
        });
      }
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const commandes = await db.getCommandesFournisseursByArtisanId(artisan.id);
    // Attach fournisseur name for each commande
    const fournisseurIds = [...new Set(commandes.map(c => c.fournisseurId))];
    const fournisseursMap = new Map<number, string>();
    for (const fid of fournisseurIds) {
      const f = await db.getFournisseurById(fid);
      if (f) fournisseursMap.set(fid, f.nom);
    }
    return commandes.map(c => ({
      ...c,
      fournisseurNom: fournisseursMap.get(c.fournisseurId) || 'Inconnu',
    }));
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
      reference: z.string().max(50).optional(),
      dateLivraisonPrevue: z.string().optional(),
      delaiLivraison: z.string().max(100).optional(),
      adresseLivraison: z.string().optional(),
      notes: z.string().optional(),
      lignes: z.array(z.object({
        articleId: z.number().nullable().optional(),
        stockId: z.number().optional(),
        designation: z.string().max(255),
        reference: z.string().max(50).optional(),
        quantite: z.number(),
        unite: z.string().max(20).optional(),
        prixUnitaire: z.number().optional(),
        tauxTVA: z.number().optional(),
      })).max(500, "Trop de lignes (max 500 par commande)") // OPE-24 — anti-DoS (boucle d'INSERT)
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);

      // Generate numero CMD-XXXXX
      const numero = await db.getNextCommandeNumero(artisan.id);

      // Calculate totals
      let totalHT = 0;
      let totalTVA = 0;
      for (const l of input.lignes) {
        const ligneHT = l.quantite * (l.prixUnitaire || 0);
        const ligneTVA = ligneHT * ((l.tauxTVA ?? 20) / 100);
        totalHT += ligneHT;
        totalTVA += ligneTVA;
      }
      const totalTTC = totalHT + totalTVA;

      const commande = await db.createCommandeFournisseur({
        artisanId: artisan.id,
        fournisseurId: input.fournisseurId,
        numero,
        reference: input.reference,
        dateLivraisonPrevue: input.dateLivraisonPrevue ? new Date(input.dateLivraisonPrevue) : undefined,
        delaiLivraison: input.delaiLivraison,
        adresseLivraison: input.adresseLivraison,
        notes: input.notes,
        montantTotal: totalTTC.toFixed(2),
        totalHT: totalHT.toFixed(2),
        totalTVA: totalTVA.toFixed(2),
        totalTTC: totalTTC.toFixed(2),
        statut: "brouillon",
      });

      // Create lines
      for (const ligne of input.lignes) {
        const ligneHT = ligne.quantite * (ligne.prixUnitaire || 0);
        await db.createLigneCommandeFournisseur({
          commandeId: commande.id,
          articleId: ligne.articleId ?? undefined,
          stockId: ligne.stockId,
          designation: ligne.designation,
          reference: ligne.reference,
          quantite: ligne.quantite.toFixed(2),
          unite: ligne.unite || 'unité',
          prixUnitaire: ligne.prixUnitaire?.toFixed(2),
          tauxTVA: (ligne.tauxTVA ?? 20).toFixed(2),
          montantTotal: ligneHT.toFixed(2),
        });
      }

      return commande;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      fournisseurId: z.number().optional(),
      reference: z.string().max(50).optional(),
      dateLivraisonPrevue: z.string().nullable().optional(),
      delaiLivraison: z.string().max(100).nullable().optional(),
      adresseLivraison: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      lignes: z.array(z.object({
        articleId: z.number().nullable().optional(),
        stockId: z.number().optional(),
        designation: z.string().max(255),
        reference: z.string().max(50).optional(),
        quantite: z.number(),
        unite: z.string().max(20).optional(),
        prixUnitaire: z.number().optional(),
        tauxTVA: z.number().optional(),
      })).max(500, "Trop de lignes (max 500 par commande)").optional(), // OPE-24 — anti-DoS
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

      const updateData: any = {};
      if (input.fournisseurId !== undefined) updateData.fournisseurId = input.fournisseurId;
      if (input.reference !== undefined) updateData.reference = input.reference;
      if (input.dateLivraisonPrevue !== undefined) updateData.dateLivraisonPrevue = input.dateLivraisonPrevue ? new Date(input.dateLivraisonPrevue) : null;
      if (input.delaiLivraison !== undefined) updateData.delaiLivraison = input.delaiLivraison;
      if (input.adresseLivraison !== undefined) updateData.adresseLivraison = input.adresseLivraison;
      if (input.notes !== undefined) updateData.notes = input.notes;

      // Recalculate totals if lines provided
      if (input.lignes) {
        let totalHT = 0;
        let totalTVA = 0;
        for (const l of input.lignes) {
          const ligneHT = l.quantite * (l.prixUnitaire || 0);
          const ligneTVA = ligneHT * ((l.tauxTVA ?? 20) / 100);
          totalHT += ligneHT;
          totalTVA += ligneTVA;
        }
        const totalTTC = totalHT + totalTVA;
        updateData.montantTotal = totalTTC.toFixed(2);
        updateData.totalHT = totalHT.toFixed(2);
        updateData.totalTVA = totalTVA.toFixed(2);
        updateData.totalTTC = totalTTC.toFixed(2);

        // Delete old lines and recreate
        await db.deleteLignesCommandeFournisseur(input.id);
        for (const ligne of input.lignes) {
          const ligneHT = ligne.quantite * (ligne.prixUnitaire || 0);
          await db.createLigneCommandeFournisseur({
            commandeId: input.id,
            articleId: ligne.articleId ?? undefined,
            stockId: ligne.stockId,
            designation: ligne.designation,
            reference: ligne.reference,
            quantite: ligne.quantite.toFixed(2),
            unite: ligne.unite || 'unité',
            prixUnitaire: ligne.prixUnitaire?.toFixed(2),
            tauxTVA: (ligne.tauxTVA ?? 20).toFixed(2),
            montantTotal: ligneHT.toFixed(2),
          });
        }
      }

      await db.updateCommandeFournisseur(input.id, updateData);
      return { success: true };
    }),

  updateStatut: protectedProcedure
    .input(z.object({
      id: z.number(),
      statut: z.enum(["brouillon", "envoyee", "confirmee", "partiellement_livree", "livree", "annulee"]),
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

  // OPE-100 — réception partielle : enregistre la quantité reçue par ligne et DÉRIVE le
  // statut de la commande (confirmee / partiellement_livree / livree). Additif : une
  // commande non réceptionnée garde quantiteRecue=0 et son statut inchangé.
  recevoir: protectedProcedure
    .input(z.object({
      id: z.number(),
      lignes: z.array(z.object({
        ligneId: z.number(),
        quantiteRecue: z.number().min(0).max(1_000_000),
      })).max(500),
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
      // Met à jour la quantité reçue des lignes appartenant À CETTE commande (les autres
      // ligneId sont ignorées → pas d'écriture cross-commande).
      const lignesCommande = await db.getLignesCommandeFournisseur(input.id);
      const idsCommande = new Set(lignesCommande.map((l: any) => l.id));
      for (const r of input.lignes) {
        if (!idsCommande.has(r.ligneId)) continue;
        await db.updateLigneCommandeRecue(r.ligneId, input.id, r.quantiteRecue);
      }
      // Recalcule le statut depuis les quantités reçues (source de vérité = lignes).
      const apres = await db.getLignesCommandeFournisseur(input.id);
      let totalCommande = 0;
      let totalRecu = 0;
      let toutRecu = true;
      for (const l of apres) {
        const cmd = parseFloat(String(l.quantite)) || 0;
        const recu = parseFloat(String((l as any).quantiteRecue)) || 0;
        totalCommande += cmd;
        totalRecu += recu;
        if (recu < cmd) toutRecu = false;
      }
      const updateData: any = {};
      // On ne sort pas d'un état terminal (annulee) ni du brouillon via la réception.
      if (commande.statut !== "annulee" && commande.statut !== "brouillon") {
        if (totalCommande > 0 && toutRecu) updateData.statut = "livree";
        else if (totalRecu > 0) updateData.statut = "partiellement_livree";
        else updateData.statut = "confirmee";
      }
      if (totalRecu > 0 && !commande.dateLivraisonReelle) {
        updateData.dateLivraisonReelle = new Date();
      }
      if (Object.keys(updateData).length > 0) {
        await db.updateCommandeFournisseur(input.id, updateData);
      }
      return { success: true, statut: updateData.statut || commande.statut };
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

  sendEmail: protectedProcedure
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
      const fournisseur = await db.getFournisseurById(commande.fournisseurId);
      if (!fournisseur?.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le fournisseur n'a pas d'adresse email" });
      }
      const lignes = await db.getLignesCommandeFournisseur(commande.id);

      // Generate PDF
      const { generateBonCommandePDF } = await import('./_core/pdfGenerator');
      const pdfBuffer = generateBonCommandePDF({ commande: { ...commande, lignes }, artisan, fournisseur });

      // Send email via Resend
      const resendKey = process.env.RESEND_API_KEY;
      const emailFrom = process.env.EMAIL_FROM || 'Operioz <noreply@operioz.com>';
      if (!resendKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Service email non configuré" });
      }

      const { Resend } = await import('resend');
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: emailFrom,
        to: fournisseur.email,
        subject: `Bon de commande ${commande.numero || ''} - ${artisan.nomEntreprise || 'Artisan'}`,
        html: `
          <p>Bonjour ${safeHtml(fournisseur.contact || fournisseur.nom)},</p>
          <p>Veuillez trouver ci-joint notre bon de commande <strong>${safeHtml(commande.numero || '')}</strong>.</p>
          ${commande.delaiLivraison ? `<p>Délai de livraison souhaité : ${safeHtml(commande.delaiLivraison)}</p>` : ''}
          ${commande.notes ? `<p>Notes : ${safeHtml(commande.notes)}</p>` : ''}
          <p>Cordialement,<br/>${safeHtml(artisan.nomEntreprise || 'Artisan')}</p>
        `,
        attachments: [{
          filename: `bon-commande-${commande.numero || commande.id}.pdf`,
          content: pdfBuffer.toString('base64'),
          content_type: 'application/pdf',
        }],
      });

      // Update statut to envoyee
      await db.updateCommandeFournisseur(input.id, { statut: 'envoyee' as any });

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
      expiresAt.setDate(expiresAt.getDate() + 90); // Valide 90 jours

      await db.createClientPortalAccess({
        clientId: client.id,
        artisanId: artisan.id,
        token,
        email: client.email,
        expiresAt,
      });

      const origin = process.env.APP_URL || ctx.req.headers.origin || 'https://www.operioz.com';
      const portalUrl = `${origin}/portail/${token}`;

      // Envoyer l'email au client
      const clientName = `${client.prenom || ''} ${client.nom}`.trim();
      const artisanName = artisan.nomEntreprise || 'Votre artisan';
      await sendEmail({
        to: client.email,
        subject: `${artisanName} — Accès à votre espace client`,
        body: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${safeHtml(artisanName)}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${safeHtml(clientName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Vous pouvez désormais consulter vos devis, factures et interventions depuis votre espace client en ligne.</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;">Accéder à mon espace client</a>
        </td></tr>
        <tr><td style="padding:0 40px 36px 40px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">Ce lien est valable 90 jours. Si vous ne pouvez pas cliquer sur le bouton, copiez ce lien dans votre navigateur :</p>
          <p style="margin:0;font-size:13px;color:#2563eb;word-break:break-all;">${portalUrl}</p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Ce message a été envoyé automatiquement depuis Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      return { url: portalUrl, token };
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
        client: client ? { id: client.id, nom: client.nom, prenom: client.prenom, email: client.email, telephone: client.telephone, adresse: client.adresse, codePostal: client.codePostal, ville: client.ville } : null,
        artisan: artisan ? { id: artisan.id, nomEntreprise: artisan.nomEntreprise, telephone: artisan.telephone, email: artisan.email, adresse: artisan.adresse, codePostal: artisan.codePostal, ville: artisan.ville, siret: artisan.siret, logo: artisan.logo } : null,
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

  // Récupérer les informations du client (public avec token)
  getClientInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      const client = await db.getClientById(access.clientId);
      const artisan = await db.getArtisanById(access.artisanId);
      if (!client) return null;
      return {
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
        telephone: client.telephone,
        adresse: client.adresse,
        codePostal: client.codePostal,
        ville: client.ville,
        artisanEmail: artisan?.email || null,
      };
    }),

  // Demander une modification d'infos (public avec token)
  demanderModification: publicProcedure
    .input(z.object({ token: z.string(), message: z.string().min(1).max(5000) }))
    .mutation(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      }
      // OPE-24 — throttle anti-flood (l'endpoint envoie un email à l'artisan).
      if (!checkPortalActionRate(`${access.artisanId}:${access.clientId}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes. Réessayez dans quelques minutes." });
      }
      const client = await db.getClientById(access.clientId);
      const artisan = await db.getArtisanById(access.artisanId);
      if (!client || !artisan?.email) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Données introuvables" });
      }
      const clientName = `${client.prenom || ''} ${client.nom}`.trim();
      await sendEmail({
        to: artisan.email,
        subject: `Demande de modification — ${clientName}`,
        body: `<p>Le client <strong>${safeHtml(clientName)}</strong> (${safeHtml(client.email || 'pas d\'email')}) demande une modification de ses informations via le portail client :</p><blockquote style="border-left:3px solid #2563eb;padding:12px;margin:16px 0;background:#f8fafc;">${safeHtml(input.message)}</blockquote>`,
      });
      return { success: true };
    }),

  // T6 : portail client intelligent. Le client decrit son besoin en texte
  // libre. L'IA (contexte metier de l'artisan) structure la demande en
  // JSON (titre, type travaux, urgence, fourchette prix, questions de
  // precision). L'artisan recoit une notification + un email. Le client
  // recoit en retour la structuration pour confirmation avant traitement.
  soumettreDemandeIA: publicProcedure
    .input(z.object({
      token: z.string(),
      description: z.string().min(10).max(2000),
    }))
    .mutation(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Accès non autorisé" });
      const client = await db.getClientById(access.clientId);
      const artisan = await db.getArtisanById(access.artisanId);
      if (!client || !artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Données introuvables" });

      // Rate-limit cote artisan : evite qu'un portail abuse de l'API IA.
      if (!checkRateLimit(artisan.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes, reessayez plus tard" });
      }

      // Lit le metier hors-schema (colonne ajoutee via fix-duplicates).
      let metier: string | null = null;
      try {
        const [rows] = await pool.execute(`SELECT metier FROM artisans WHERE id = ?`, [artisan.id]);
        const r: any = Array.isArray(rows) ? rows[0] : null;
        metier = r?.metier || (artisan as any).specialite || null;
      } catch {
        metier = (artisan as any).specialite || null;
      }
      const contexteMetier = getContexteMetier(metier);

      const clientName = `${client.prenom || ''} ${client.nom}`.trim();

      let structured: {
        titre: string;
        descriptionReformulee: string;
        typeTravaux: string;
        urgence: "faible" | "normale" | "urgente";
        estimationMin: number | null;
        estimationMax: number | null;
        questions: string[];
      } = {
        titre: input.description.slice(0, 60),
        descriptionReformulee: input.description,
        typeTravaux: "Non determine",
        urgence: "normale",
        estimationMin: null,
        estimationMax: null,
        questions: [],
      };

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `Un client (${clientName}) decrit son besoin sur le portail :
"""
${input.description}
"""

Tache : structure cette demande pour l'artisan. Donne un titre court, reformule clairement, identifie le type de travaux, estime l'urgence (faible/normale/urgente), donne une fourchette de prix realiste marche francais 2024 (estimation_min et estimation_max en euros TTC) et propose 2 a 3 questions de precision a poser au client pour pouvoir chiffrer.

Reponds UNIQUEMENT en JSON pur (pas de markdown, pas de texte avant/apres) :
{"titre":"court","description_reformulee":"clair","type_travaux":"libelle","urgence":"normale","estimation_min":0,"estimation_max":0,"questions":["q1","q2"]}` }] }],
          config: { systemInstruction: contexteMetier, temperature: 0.4, maxOutputTokens: 1200 },
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          structured = {
            titre: String(data.titre || structured.titre).slice(0, 120),
            descriptionReformulee: String(data.description_reformulee || input.description).slice(0, 1500),
            typeTravaux: String(data.type_travaux || "Non determine").slice(0, 80),
            urgence: ["faible", "normale", "urgente"].includes(data.urgence) ? data.urgence : "normale",
            estimationMin: Number.isFinite(Number(data.estimation_min)) ? Number(data.estimation_min) : null,
            estimationMax: Number.isFinite(Number(data.estimation_max)) ? Number(data.estimation_max) : null,
            questions: Array.isArray(data.questions) ? data.questions.slice(0, 5).map((q: any) => String(q).slice(0, 200)) : [],
          };
        }
      } catch (e: any) {
        console.warn("[soumettreDemandeIA]", sanitizeIaError(e));
        // On continue avec structured par defaut : l'artisan recevra
        // au moins le texte brut du client.
      }

      const fourchette = structured.estimationMin && structured.estimationMax
        ? `${structured.estimationMin}-${structured.estimationMax} €`
        : "à chiffrer";
      const urgenceLabel = structured.urgence === "urgente" ? "Urgente" : structured.urgence === "faible" ? "Faible" : "Normale";

      // Notification artisan (in-app, in best-effort)
      try {
        await db.createNotification({
          artisanId: artisan.id,
          type: "info",
          titre: `Nouvelle demande : ${structured.titre}`,
          message: `${clientName} — ${structured.typeTravaux} — Devis estime : ${fourchette} (${urgenceLabel})`,
          lien: "/clients",
        });
      } catch (e) { console.error("[soumettreDemandeIA] notif:", e); }

      // Email artisan (best-effort)
      if (artisan.email) {
        try {
          const questionsHtml = structured.questions.length
            ? `<p style="margin-top:16px;"><strong>Questions a poser au client :</strong></p><ul>${structured.questions.map(q => `<li>${safeHtml(q)}</li>`).join("")}</ul>`
            : "";
          await sendEmail({
            to: artisan.email,
            subject: `Nouvelle demande portail : ${structured.titre}`,
            body: `<p>Nouvelle demande de <strong>${safeHtml(clientName)}</strong> (${safeHtml(client.email || "pas d'email")} - ${safeHtml(client.telephone || "pas de tel")}) via le portail client.</p>
<p><strong>Type :</strong> ${safeHtml(structured.typeTravaux)} &nbsp;|&nbsp; <strong>Urgence :</strong> ${urgenceLabel} &nbsp;|&nbsp; <strong>Devis estime :</strong> ${fourchette}</p>
<p><strong>Description reformulee par l'IA :</strong></p>
<blockquote style="border-left:3px solid #8b5cf6;padding:12px;margin:16px 0;background:#f8fafc;">${safeHtml(structured.descriptionReformulee)}</blockquote>
<p><strong>Texte original du client :</strong></p>
<blockquote style="border-left:3px solid #cbd5e1;padding:12px;margin:16px 0;background:#f8fafc;color:#475569;">${safeHtml(input.description)}</blockquote>
${questionsHtml}`,
          });
        } catch (e) { console.error("[soumettreDemandeIA] email:", e); }
      }

      return {
        success: true,
        structured,
      };
    }),

  // Statut du portail pour un client (protégé — côté artisan)
  getStatus: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      const access = await db.getPortalAccessByClientId(input.clientId, artisan.id);
      if (!access) return null;
      return {
        actif: access.isActive,
        token: access.token,
        dateExpiration: access.expiresAt,
        lastAccessAt: access.lastAccessAt,
        createdAt: access.createdAt,
      };
    }),

  // Désactiver le portail (protégé — côté artisan)
  deactivate: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }
      await db.deactivatePortalAccess(input.clientId, artisan.id);
      return { success: true };
    }),

  // ---- PORTAL CHAT (public, token-based) ----
  getConversations: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getConversationsByClientId(access.clientId, access.artisanId);
    }),

  getConversationMessages: publicProcedure
    .input(z.object({ token: z.string(), conversationId: z.number() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
        throw new TRPCError({ code: "FORBIDDEN" });
      await db.markMessagesAsRead(input.conversationId, 'client');
      return db.getMessagesByConversationId(input.conversationId);
    }),

  sendClientMessage: publicProcedure
    .input(z.object({ token: z.string(), conversationId: z.number(), contenu: z.string().min(1).max(5000) }))
    .mutation(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
        throw new TRPCError({ code: "FORBIDDEN" });
      const msg = await db.createMessage({
        conversationId: input.conversationId,
        auteur: 'client',
        contenu: input.contenu,
      });
      // Notification pour l'artisan
      try {
        const client = await db.getClientById(access.clientId);
        const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Un client';
        await db.createNotification({
          artisanId: access.artisanId,
          type: "info",
          titre: `Nouveau message de ${clientName}`,
          message: input.contenu.substring(0, 200),
          lien: "/chat",
        });
      } catch (e) { console.error('[Notification] sendClientMessage error:', e); }
      return msg;
    }),

  markClientMessagesAsRead: publicProcedure
    .input(z.object({ token: z.string(), conversationId: z.number() }))
    .mutation(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
      await db.markMessagesAsRead(input.conversationId, 'client');
      return { success: true };
    }),

  // ---- RDV EN LIGNE (public, token-based) ----
  getCreneauxDisponibles: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acces non autorise" });

      const now = new Date();
      const debut = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const fin = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const occupied = await db.getCreneauxOccupes(access.artisanId, debut, fin);

      const slots: string[] = [];
      const current = new Date(debut);
      current.setHours(0, 0, 0, 0);

      while (current <= fin) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          for (let hour = 8; hour < 18; hour++) {
            const slotStart = new Date(current);
            slotStart.setHours(hour, 0, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

            if (slotStart <= debut) continue;

            const isOccupied = occupied.some(occ => {
              const occEnd = occ.dateFin || new Date(occ.dateDebut.getTime() + 60 * 60 * 1000);
              return slotStart < occEnd && slotEnd > occ.dateDebut;
            });

            if (!isOccupied) {
              slots.push(slotStart.toISOString());
            }
          }
        }
        current.setDate(current.getDate() + 1);
      }
      return slots;
    }),

  demanderRdv: publicProcedure
    .input(z.object({
      token: z.string(),
      titre: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      urgence: z.enum(["normale", "urgente", "tres_urgente"]).default("normale"),
      dateProposee: z.string().max(40),
    }))
    .mutation(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acces non autorise" });

      // OPE-24 — throttle anti-flood (crée un RDV + notifie l'artisan à chaque appel).
      if (!checkPortalActionRate(`${access.artisanId}:${access.clientId}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes. Réessayez dans quelques minutes." });
      }

      const dateProposee = new Date(input.dateProposee);
      // Date invalide : `NaN < minDate` est toujours faux → sans ce garde, une date
      // malformée contournerait le contrôle des 24h et serait insérée (colonne notNull).
      if (isNaN(dateProposee.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date proposée invalide" });
      }
      const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (dateProposee < minDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le creneau doit etre au moins 24h a l'avance" });
      }
      // Borne supérieure : rejette un futur absurde (année 9999) → pollution de données.
      // 2 ans dépasse tout créneau d'intervention légitime, aucun RDV réel n'est concerné.
      const maxDate = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
      if (dateProposee > maxDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date proposée est trop éloignée" });
      }

      const rdv = await db.createRdvEnLigne({
        artisanId: access.artisanId,
        clientId: access.clientId,
        titre: input.titre,
        description: input.description,
        urgence: input.urgence,
        dateProposee,
        dureeEstimee: 60,
      });

      const client = await db.getClientById(access.clientId);
      const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Un client';
      await db.createNotification({
        artisanId: access.artisanId,
        type: "info",
        titre: `Nouvelle demande de RDV de ${clientName}`,
        message: `${input.titre} — ${dateProposee.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
        lien: "/rdv-en-ligne",
      });

      return rdv;
    }),

  getMesRdv: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acces non autorise" });
      return db.getRdvByClientId(access.clientId, access.artisanId);
    }),

  // Suivi chantier visible par le client
  getSuiviChantiers: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const access = await db.getClientPortalAccessByToken(input.token);
      if (!access) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acces non autorise" });
      // Récupérer les chantiers du client
      const chantiersClient = await db.getChantiersByArtisan(access.artisanId);
      const mesChan = chantiersClient.filter((c: any) => c.clientId === access.clientId);
      // Pour chaque chantier, récupérer les étapes visibles
      const result = await Promise.all(mesChan.map(async (c: any) => {
        const etapes = await db.getSuiviVisibleClient(c.id);
        return { ...c, etapes };
      }));
      return result;
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

  getByClientId: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return db.getContratsByClientId(input.clientId, artisan.id);
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      titre: z.string().max(255),
      description: z.string().optional(),
      type: z.enum(["maintenance_preventive", "entretien", "depannage", "contrat_service"]).optional(),
      montantHT: z.string(),
      tauxTVA: z.string().optional(),
      periodicite: z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      reconduction: z.boolean().optional(),
      preavisResiliation: z.number().optional(),
      conditionsParticulieres: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const reference = await db.getNextContratNumber(artisan.id);

      // Garde de validité des dates : `new Date("garbage")` -> Invalid Date, qui finit
      // dans `contrats_maintenance.dateDebut` (timestamp NOT NULL) -> 500 MySQL en mode
      // strict, et casse silencieusement `prochainFacturation`. On rejette proprement en 400.
      // Behavior-preserving : une date valide (sélecteur front) passe à l'identique.
      const dateDebut = new Date(input.dateDebut);
      if (isNaN(dateDebut.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date de début invalide" });
      }
      let dateFin: Date | undefined;
      if (input.dateFin) {
        dateFin = new Date(input.dateFin);
        if (isNaN(dateFin.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date de fin invalide" });
        }
      }
      let prochainFacturation = new Date(dateDebut);

      return await db.createContrat({
        artisanId: artisan.id,
        clientId: input.clientId,
        reference,
        titre: input.titre,
        description: input.description,
        type: input.type || "entretien",
        montantHT: input.montantHT,
        tauxTVA: input.tauxTVA || "20.00",
        periodicite: input.periodicite,
        dateDebut,
        dateFin,
        reconduction: input.reconduction ?? true,
        preavisResiliation: input.preavisResiliation ?? 1,
        conditionsParticulieres: input.conditionsParticulieres,
        prochainFacturation,
        statut: "actif",
        notes: input.notes,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titre: z.string().max(255).optional(),
      description: z.string().optional(),
      type: z.enum(["maintenance_preventive", "entretien", "depannage", "contrat_service"]).optional(),
      montantHT: z.string().optional(),
      tauxTVA: z.string().optional(),
      periodicite: z.enum(["mensuel", "trimestriel", "semestriel", "annuel"]).optional(),
      dateFin: z.string().optional(),
      reconduction: z.boolean().optional(),
      preavisResiliation: z.number().optional(),
      conditionsParticulieres: z.string().optional(),
      statut: z.enum(["actif", "suspendu", "termine", "annule"]).optional(),
      prochainPassage: z.string().optional(),
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
        prochainPassage: updateData.prochainPassage ? new Date(updateData.prochainPassage) : undefined,
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
      
      const facture = await db.createFacture(artisan.id, {
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

  // Interventions liées au contrat
  getInterventions: protectedProcedure
    .input(z.object({ contratId: z.number() }))
    .query(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.contratId);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return db.getInterventionsContratByContratId(input.contratId);
    }),

  createIntervention: protectedProcedure
    .input(z.object({
      contratId: z.number(),
      titre: z.string(),
      description: z.string().optional(),
      dateIntervention: z.string(),
      duree: z.string().optional(),
      technicienNom: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.contratId);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      return db.createInterventionContrat({
        contratId: input.contratId,
        artisanId: artisan.id,
        titre: input.titre,
        description: input.description,
        dateIntervention: new Date(input.dateIntervention),
        duree: input.duree,
        technicienNom: input.technicienNom,
        notes: input.notes,
        statut: "planifiee",
      });
    }),

  updateIntervention: protectedProcedure
    .input(z.object({
      id: z.number(),
      contratId: z.number(),
      titre: z.string().optional(),
      description: z.string().optional(),
      dateIntervention: z.string().optional(),
      duree: z.string().optional(),
      technicienNom: z.string().optional(),
      statut: z.enum(["planifiee", "en_cours", "effectuee", "annulee"]).optional(),
      rapport: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const contrat = await db.getContratById(input.contratId);
      if (!contrat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrat non trouvé" });
      }
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan || contrat.artisanId !== artisan.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé" });
      }
      // SECURITE (OPE-89) : verifier que l'intervention appartient bien au contrat
      // verifie ci-dessus (le contrat appartient a l'artisan). Sans ce controle,
      // input.id (intervention) est decouple de input.contratId (parent) -> IDOR
      // cross-tenant (modification de l'intervention d'un autre tenant).
      const interventionExistante = await db.getInterventionContratById(input.id);
      if (!interventionExistante || interventionExistante.contratId !== contrat.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
      }
      const { id, contratId, ...updateData } = input;
      return db.updateInterventionContrat(id, {
        ...updateData,
        dateIntervention: updateData.dateIntervention ? new Date(updateData.dateIntervention) : undefined,
      });
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
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const convs = await db.getConversationsByArtisanId(artisan.id);
    return Promise.all(convs.map(async (conv) => {
      const client = await db.getClientById(conv.clientId);
      return { ...conv, client };
    }));
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.markMessagesAsRead(input.conversationId, 'artisan');
      return db.getMessagesByConversationId(input.conversationId);
    }),

  sendMessage: protectedProcedure
    .input(z.object({ conversationId: z.number(), contenu: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });

      const msg = await db.createMessage({
        conversationId: input.conversationId,
        auteur: 'artisan',
        contenu: input.contenu,
      });

      // Email notification au client
      try {
        const client = await db.getClientById(conv.clientId);
        if (client?.email) {
          const portalAccess = await db.getPortalAccessByClientId(conv.clientId, artisan.id);
          const portalLink = portalAccess?.token
            ? `${process.env.APP_URL || 'https://www.operioz.com'}/portail/${portalAccess.token}`
            : null;
          await sendEmail({
            to: client.email,
            subject: `Nouveau message de ${artisan.nomEntreprise || 'votre artisan'}`,
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#2980b9">Nouveau message</h2>
              <p>Bonjour ${safeHtml(client.prenom || client.nom)},</p>
              <p><strong>${safeHtml(artisan.nomEntreprise || 'Votre artisan')}</strong> vous a envoyé un message :</p>
              <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #2980b9">
                <p style="margin:0">${safeHtml(input.contenu.substring(0, 300))}${input.contenu.length > 300 ? '...' : ''}</p>
              </div>
              ${portalLink ? `<p><a href="${portalLink}" style="background:#2980b9;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;display:inline-block">Répondre sur le portail</a></p>` : ''}
              <p style="color:#999;font-size:12px">Cet email a été envoyé automatiquement.</p>
            </div>`,
          });
        }
      } catch (e) { console.error('[Chat] Email notification error:', e); }

      return msg;
    }),

  startConversation: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      sujet: z.string().optional(),
      premierMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const client = await db.getClientById(input.clientId);
      if (!client || client.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });

      const conv = await db.getOrCreateConversation(artisan.id, input.clientId, input.sujet);

      if (input.premierMessage) {
        await db.createMessage({
          conversationId: conv.id,
          auteur: 'artisan',
          contenu: input.premierMessage,
        });
      }

      return conv;
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return 0;
    return db.getUnreadMessagesCount(artisan.id);
  }),

  archiveConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });
      return db.updateConversation(input.conversationId, { statut: 'archivee' });
    }),

  closeConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });
      return db.updateConversation(input.conversationId, { statut: 'fermee' });
    }),

  reopenConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const conv = await db.getConversationById(input.conversationId);
      if (!conv || conv.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN" });
      return db.updateConversation(input.conversationId, { statut: 'ouverte' });
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
      // Bornes alignées sur les colonnes de `techniciens` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      nom: z.string().min(1).max(255),
      prenom: z.string().max(255).optional(),
      email: z.string().email().max(320).optional(),
      telephone: z.string().max(20).optional(),
      specialite: z.string().max(100).optional(),
      couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      // OPE-123 — coût horaire chargé (decimal stocké en string). Borné, optionnel.
      coutHoraire: z.string().regex(/^\d+(\.\d{1,2})?$/, "Coût horaire invalide").max(12).optional(),
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
      nom: z.string().min(1).max(255).optional(),
      prenom: z.string().max(255).optional(),
      email: z.string().email().max(320).optional(),
      telephone: z.string().max(20).optional(),
      specialite: z.string().max(100).optional(),
      couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      coutHoraire: z.string().regex(/^\d+(\.\d{1,2})?$/, "Coût horaire invalide").max(12).optional(),
      statut: z.enum(["actif", "inactif", "conge"]).optional(),
      notes: z.string().max(5000).optional(),
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

  // Alias list → getAll
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const avis = await db.getAvisByArtisanId(artisan.id);
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
      // OPE-76 (même classe) — le lien d'avis vient d'une source de confiance
      // (APP_URL), pas du header Origin (contrôlable). Corrige aussi le repli erroné
      // sur http://localhost:3000. Pour une requête légitime, Origin == APP_URL.
      const baseUrl = process.env.APP_URL || 'https://www.operioz.com';
      const lienAvis = `${baseUrl}/avis/${token}`;
      
      await sendEmail({
        to: client.email,
        subject: `Votre avis sur notre intervention - ${artisan.nomEntreprise || 'Artisan'}`,
        body: `
          <h2>Bonjour ${safeHtml(client.nom)},</h2>
          <p>Suite à notre intervention du ${new Date(intervention.dateDebut).toLocaleDateString('fr-FR')}, nous aimerions connaître votre avis.</p>
          <p>Votre retour est précieux et nous aide à améliorer nos services.</p>
          <p><a href="${lienAvis}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Donner mon avis</a></p>
          <p>Ce lien est valable pendant 14 jours.</p>
          <p>Merci de votre confiance,<br>${safeHtml(artisan.nomEntreprise || 'Votre artisan')}</p>
        `,
      });
      
      return demande;
    }),

  // Envoyer une demande d'avis par client (trouve la dernière intervention automatiquement)
  envoyerDemandeParClient: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Artisan non trouvé" });
      }

      const client = await db.getClientById(input.clientId);
      if (!client || !client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n'a pas d'email" });
      }

      // Trouver la dernière intervention pour ce client
      const interventions = await db.getInterventionsByClientId(input.clientId);
      const artisanInterventions = interventions.filter(i => i.artisanId === artisan.id);

      // Utiliser la dernière intervention, ou créer une demande sans intervention spécifique
      const intervention = artisanInterventions[0];
      if (!intervention) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune intervention trouvée pour ce client" });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const demande = await db.createDemandeAvis({
        artisanId: artisan.id,
        clientId: client.id,
        interventionId: intervention.id,
        tokenDemande: token,
        emailEnvoyeAt: new Date(),
        expiresAt,
      });

      // OPE-76 (même classe) — le lien d'avis vient d'une source de confiance
      // (APP_URL), pas du header Origin (contrôlable). Corrige aussi le repli erroné
      // sur http://localhost:3000. Pour une requête légitime, Origin == APP_URL.
      const baseUrl = process.env.APP_URL || 'https://www.operioz.com';
      const lienAvis = `${baseUrl}/avis/${token}`;

      await sendEmail({
        to: client.email,
        subject: `Votre avis nous intéresse - ${artisan.nomEntreprise || 'Artisan'}`,
        body: `
          <h2>Bonjour ${safeHtml(client.nom)},</h2>
          <p>Nous espérons que vous êtes satisfait de nos services.</p>
          <p>Votre avis est précieux et nous aide à améliorer nos prestations. Pourriez-vous prendre quelques instants pour nous laisser un retour ?</p>
          <p><a href="${lienAvis}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Donner mon avis</a></p>
          <p>Ce lien est valable pendant 14 jours.</p>
          <p>Merci de votre confiance,<br>${safeHtml(artisan.nomEntreprise || 'Votre artisan')}</p>
        `,
      });

      return demande;
    }),

  // Répondre à un avis
  repondre: protectedProcedure
    .input(z.object({
      avisId: z.number(),
      reponse: z.string().min(1).max(5000),
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
      commentaire: z.string().max(5000).optional(),
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
// SECURITE RGPD CRITIQUE : la position GPS d'un technicien est une donnee
// hautement sensible. Tous les endpoints qui prennent un technicienId DOIVENT
// verifier que ce technicien appartient bien a l'artisan authentifie.
// ============================================================================

async function assertTechnicienOwner(technicienId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const tech = artisan ? await db.getTechnicienById(technicienId) : null;
  if (!tech || !artisan || tech.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Technicien non trouve" });
  }
  return { tech, artisan };
}

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
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
      return await db.updatePositionTechnicien(input);
    }),

  getPositions: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAllTechniciensPositions(artisan.id);
  }),

  getLastPosition: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
      return await db.getLastPositionByTechnicienId(input.technicienId);
    }),

  getHistorique: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
      return await db.createHistoriqueDeplacement(input);
    }),

  getHistoriqueDeplacements: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
      return await db.getHistoriqueDeplacementsByTechnicienId(input.technicienId);
    }),
});

// ============================================================================
// COMPTABILITE ROUTER
// ============================================================================
const comptabiliteRouter = router({
  getEcritures: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getEcrituresComptables(artisan.id, input?.dateDebut, input?.dateFin);
    }),

  getGrandLivre: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const now = new Date();
      const dateDebut = input?.dateDebut || new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFin = input?.dateFin || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await db.getGrandLivre(artisan.id, dateDebut, dateFin);
    }),

  getBalance: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const now = new Date();
      const dateDebut = input?.dateDebut || new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFin = input?.dateFin || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await db.getBalance(artisan.id, dateDebut, dateFin);
    }),

  getJournalVentes: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const now = new Date();
      const dateDebut = input?.dateDebut || new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFin = input?.dateFin || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await db.getJournalVentes(artisan.id, dateDebut, dateFin);
    }),

  getRapportTVA: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0 };
      const now = new Date();
      const dateDebut = input?.dateDebut || new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFin = input?.dateFin || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await db.getRapportTVA(artisan.id, dateDebut, dateFin);
    }),

  // Alias getDeclarationTVA → getRapportTVA
  getDeclarationTVA: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date().optional(),
      dateFin: z.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0 };
      const now = new Date();
      const dateDebut = input?.dateDebut || new Date(now.getFullYear(), now.getMonth(), 1);
      const dateFin = input?.dateFin || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await db.getRapportTVA(artisan.id, dateDebut, dateFin);
    }),

  genererEcrituresFacture: comptaVoirProcedure
    .input(z.object({ factureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE (OPE-38) : la facture doit appartenir au tenant appelant (sinon
      // génération/écrasement d'écritures comptables cross-tenant).
      const artisan = ctx.user ? await db.getArtisanByUserId(ctx.user.id) : null;
      const facture = artisan ? await db.getFactureById(input.factureId) : null;
      if (!artisan || !facture || facture.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
      }
      return await db.genererEcrituresFacture(input.factureId);
    }),

  getPlanComptable: comptaVoirProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getPlanComptable(artisan.id);
  }),

  initPlanComptable: comptaVoirProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    await db.initPlanComptable(artisan.id);
    return { success: true };
  }),

  // Aperçu FEC (premières lignes)
  getFecPreview: comptaVoirProcedure
    .input(z.object({
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { lines: [], totalFactures: 0, siret: '', conformite: null };

      const dateFin = new Date(input.dateFin);
      dateFin.setHours(23, 59, 59, 999);
      // Aperçu = mêmes données que le fichier téléchargé (générateur FEC unique).
      const { content, conformite } = await db.genererFEC(artisan.id, input.dateDebut, dateFin);
      const rows = content.split('\n').filter((r) => r.length > 0);
      const header = (rows[0] || '').split('\t');
      const col = (name: string) => header.indexOf(name);
      const lines = rows.slice(1, 16).map((r) => {
        const c = r.split('\t');
        return {
          ecritureNum: c[col('EcritureNum')] || '',
          ecritureDate: c[col('EcritureDate')] || '',
          compteNum: c[col('CompteNum')] || '',
          compteLib: c[col('CompteLib')] || '',
          pieceRef: c[col('PieceRef')] || '',
          ecritureLib: c[col('EcritureLib')] || '',
          debit: c[col('Debit')] || '0,00',
          credit: c[col('Credit')] || '0,00',
        };
      });
      return { lines, totalFactures: conformite.nbEcritures, siret: artisan.siret || '', conformite };
    }),

  // Contrôle de conformité FEC (pour badge UI) — sans télécharger le fichier.
  getFecConformite: comptaVoirProcedure
    .input(z.object({ dateDebut: z.date(), dateFin: z.date() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      const dateFin = new Date(input.dateFin);
      dateFin.setHours(23, 59, 59, 999);
      const { conformite } = await db.genererFEC(artisan.id, input.dateDebut, dateFin);
      return conformite;
    }),

  // Déclaration TVA détaillée (CA3) : base imposable + TVA par taux.
  getDeclarationTVADetail: comptaVoirProcedure
    .input(z.object({ dateDebut: z.date(), dateFin: z.date() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { parTaux: [], tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0 };
      const dateFin = new Date(input.dateFin);
      dateFin.setHours(23, 59, 59, 999);
      return await db.getDeclarationTVADetail(artisan.id, input.dateDebut, dateFin);
    }),
});

// ============================================================================
// DEVIS OPTIONS ROUTER
// ============================================================================
// SECURITE (OPE-10) : les options/lignes de devis n'ont pas d'artisanId direct ;
// l'ownership se dérive via le devis parent (devis.artisanId). Les helpers DB ne
// scopent que par id -> sans ces gardes, IDOR cross-tenant (lecture/écriture/
// suppression/conversion des options & lignes d'un autre tenant).
async function assertDevisOwner(devisId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const devis = artisan ? await db.getDevisById(devisId) : null;
  if (!artisan || !devis || (devis as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
  }
  return { devis, artisan };
}

async function assertOptionOwner(optionId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const option = artisan ? await db.getDevisOptionById(optionId) : null;
  const devis = option ? await db.getDevisById((option as any).devisId) : null;
  if (!artisan || !option || !devis || (devis as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Option non trouvée" });
  }
  return { option, devis, artisan };
}

const devisOptionsRouter = router({
  getByDevisId: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDevisOwner(input.devisId, ctx.user.id);
      return await db.getDevisOptionsByDevisId(input.devisId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertOptionOwner(input.id, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertDevisOwner(input.devisId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.id, ctx.user.id);
      const { id, ...data } = input;
      return await db.updateDevisOption(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.id, ctx.user.id);
      await db.deleteDevisOption(input.id);
      return { success: true };
    }),

  select: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
      return await db.selectDevisOption(input.optionId);
    }),

  convertirEnDevis: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
      await db.convertirOptionEnDevis(input.optionId);
      return { success: true };
    }),

  // Lignes d'option
  getLignes: protectedProcedure
    .input(z.object({ optionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
      return await db.getDevisOptionLignesByOptionId(input.optionId);
    }),

  createLigne: protectedProcedure
    .input(z.object({
      optionId: z.number(),
      articleId: z.number().optional(),
      designation: z.string().max(255),
      description: z.string().max(5000).optional(),
      quantite: z.string().optional(),
      unite: z.string().max(20).optional(),
      prixUnitaireHT: z.string().optional(),
      tauxTVA: z.string().optional(),
      remise: z.string().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertOptionOwner(input.optionId, ctx.user.id);
      await db.deleteDevisOptionLigne(input.id);
      await db.recalculerTotauxOption(input.optionId);
      return { success: true };
    }),
});

// ============================================================================
// RAPPORTS PERSONNALISABLES ROUTER
// ============================================================================
// SECURITE (OPE-46) : les rapports portent un artisanId ; les helpers DB ne scopent
// que par id -> sans cette garde, IDOR (executer fuit les données du tenant
// propriétaire du rapport ; getById/update/delete/toggleFavori/historique cross-tenant).
async function assertRapportOwner(rapportId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const rapport = artisan ? await db.getRapportPersonnaliseById(rapportId) : null;
  if (!rapport || !artisan || (rapport as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Rapport non trouvé" });
  }
  return { rapport, artisan };
}

const rapportsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getRapportsPersonnalisesByArtisanId(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertRapportOwner(input.id, ctx.user.id);
      return await db.getRapportPersonnaliseById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      // Bornes alignées sur les colonnes `rapports_personnalises` (nom varchar(100),
      // groupement/tri varchar(50)) : évite un ER_DATA_TOO_LONG (500) sur une entrée
      // surdimensionnée. Behavior-preserving (un nom/tri de rapport légitime est court).
      nom: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      type: z.enum(["ventes", "clients", "interventions", "stocks", "fournisseurs", "techniciens", "financier"]),
      filtres: z.record(z.string(), z.unknown()).optional(),
      colonnes: z.array(z.string().max(100)).max(100).optional(),
      groupement: z.string().max(50).optional(),
      tri: z.string().max(50).optional(),
      format: z.enum(["tableau", "graphique", "liste"]).optional(),
      graphiqueType: z.enum(["bar", "line", "pie", "doughnut"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createRapportPersonnalise({
        artisanId: artisan.id,
        ...input,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().min(1).max(100).optional(),
      description: z.string().max(2000).optional(),
      filtres: z.record(z.string(), z.unknown()).optional(),
      colonnes: z.array(z.string().max(100)).max(100).optional(),
      groupement: z.string().max(50).optional(),
      tri: z.string().max(50).optional(),
      format: z.enum(["tableau", "graphique", "liste"]).optional(),
      graphiqueType: z.enum(["bar", "line", "pie", "doughnut"]).optional(),
      favori: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertRapportOwner(input.id, ctx.user.id);
      const { id, ...data } = input;
      return await db.updateRapportPersonnalise(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertRapportOwner(input.id, ctx.user.id);
      await db.deleteRapportPersonnalise(input.id);
      return { success: true };
    }),

  toggleFavori: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertRapportOwner(input.id, ctx.user.id);
      return await db.toggleRapportFavori(input.id);
    }),

  executer: protectedProcedure
    .input(z.object({
      rapportId: z.number(),
      parametres: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // OPE-46 : sans cette garde, executerRapport exécute la requête scopée sur
      // rapport.artisanId (le propriétaire = la victime) -> fuite cross-tenant.
      await assertRapportOwner(input.rapportId, ctx.user.id);
      return await db.executerRapport(input.rapportId, input.parametres);
    }),

  historique: protectedProcedure
    .input(z.object({ rapportId: z.number(), limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      await assertRapportOwner(input.rapportId, ctx.user.id);
      return await db.getHistoriqueExecutions(input.rapportId, input.limit);
    }),
});

// ============================================================================
// NOTIFICATIONS PUSH ROUTER
// ============================================================================
// SECURITE (OPE-31) : vérifie que le technicien ciblé appartient bien au tenant de
// l'appelant. Les helpers DB ne scopent que par technicienId -> sans cette garde,
// un artisan peut cibler les techniciens d'un autre tenant (push hijack, lecture
// historique/congés). Pattern déjà utilisé dans techniciensRouter.
async function assertTechnicienOwnership(technicienId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
  const tech = await db.getTechnicienById(technicienId);
  if (!tech || tech.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable" });
  }
  return { artisan, tech };
}

const notificationsPushRouter = router({
  subscribe: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
      return await db.savePushSubscription(input);
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE (OPE-31) : ne désactiver l'abonnement que s'il appartient à un
      // technicien du tenant appelant (résolution endpoint -> technicienId).
      const sub = await db.getPushSubscriptionByEndpoint(input.endpoint);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Abonnement non trouvé" });
      await assertTechnicienOwner(sub.technicienId, ctx.user.id);
      await db.deletePushSubscription(input.endpoint);
      return { success: true };
    }),

  getPreferences: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
      return await db.savePreferencesNotifications(input);
    }),

  getHistorique: protectedProcedure
    .input(z.object({ technicienId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
      return await db.getHistoriqueNotificationsPush(input.technicienId, input.limit);
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE (OPE-31) : l'entrée d'historique doit appartenir à un technicien
      // du tenant appelant (résolution id -> technicienId).
      const entry = await db.getHistoriqueNotificationPushById(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Notification non trouvée" });
      await assertTechnicienOwner(entry.technicienId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.getCongesByArtisan(artisan.id, input.statut);
    }),

  enAttente: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getOrCreateArtisan(ctx.user.id);
    return await db.getCongesEnAttente(artisan.id);
  }),

  byTechnicien: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      // SECURITE (OPE-31) : congés (dont arrêts maladie) = données salariés sensibles.
      await assertTechnicienOwnership(input.technicienId, ctx.user.id);
      return await db.getCongesByTechnicien(input.technicienId);
    }),

  byPeriode: protectedProcedure
    .input(z.object({ dateDebut: z.string(), dateFin: z.string() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
      // SECURITE (OPE-45) : le congé doit appartenir au tenant appelant (sinon
      // approbation cross-tenant). conges.artisanId est NOT NULL.
      const congeArtisan = await db.getArtisanByUserId(ctx.user.id);
      if (!conge || !congeArtisan || conge.artisanId !== congeArtisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Congé non trouvé" });
      }
      // Garde d'idempotence : ne décompter le solde QUE lors de la transition vers
      // "approuve". Sans ce garde, une ré-approbation (double-clic / re-jeu) re-décompte
      // le solde (updateSoldeConges est additif) -> jours de congé perdus pour le salarié.
      if (conge && conge.statut !== 'approuve') {
        // Calculer le nombre de jours
        const debut = new Date(conge.dateDebut);
        const fin = new Date(conge.dateFin);
        const diffTime = Math.abs(fin.getTime() - debut.getTime());
        let jours = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (conge.demiJourneeDebut) jours -= 0.5;
        if (conge.demiJourneeFin) jours -= 0.5;

        // Mettre à jour le solde si c'est un congé payé ou RTT
        if (conge.type === 'conge_paye' || conge.type === 'rtt') {
          await db.updateSoldeConges(conge.technicienId, conge.artisanId, conge.type, new Date().getFullYear(), jours);
        }
      }
      return await db.updateCongeStatut(input.id, 'approuve', ctx.user.id, input.commentaire);
    }),

  refuser: protectedProcedure
    .input(z.object({ id: z.number(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // SECURITE (OPE-45) : ownership du congé avant refus.
      const conge = await db.getCongeById(input.id);
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!conge || !artisan || conge.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Congé non trouvé" });
      }
      return await db.updateCongeStatut(input.id, 'refuse', ctx.user.id, input.commentaire);
    }),

  annuler: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conge = await db.getCongeById(input.id);
      // SECURITE (OPE-45) : ownership du congé avant annulation.
      const congeArtisan = await db.getArtisanByUserId(ctx.user.id);
      if (!conge || !congeArtisan || conge.artisanId !== congeArtisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Congé non trouvé" });
      }
      // Recréditer le solde si on annule un congé APPROUVÉ (qui avait décompté le solde).
      // Le garde statut === 'approuve' évite tout recrédit sur un congé non décompté
      // (en_attente/refuse) et tout double-recrédit (après annulation, statut = 'annule').
      if (conge && conge.statut === 'approuve' && (conge.type === 'conge_paye' || conge.type === 'rtt')) {
        const debut = new Date(conge.dateDebut);
        const fin = new Date(conge.dateFin);
        let jours = Math.ceil(Math.abs(fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (conge.demiJourneeDebut) jours -= 0.5;
        if (conge.demiJourneeFin) jours -= 0.5;
        await db.updateSoldeConges(conge.technicienId, conge.artisanId, conge.type, new Date().getFullYear(), -jours);
      }
      return await db.updateCongeStatut(input.id, 'annule', ctx.user.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conge = await db.getCongeById(input.id);
      // SECURITE (OPE-45) : ownership du congé avant hard-delete.
      const congeArtisan = await db.getArtisanByUserId(ctx.user.id);
      if (!conge || !congeArtisan || conge.artisanId !== congeArtisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Congé non trouvé" });
      }
      // Recréditer le solde si on supprime un congé APPROUVÉ (même logique qu'annuler).
      if (conge && conge.statut === 'approuve' && (conge.type === 'conge_paye' || conge.type === 'rtt')) {
        const debut = new Date(conge.dateDebut);
        const fin = new Date(conge.dateFin);
        let jours = Math.ceil(Math.abs(fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (conge.demiJourneeDebut) jours -= 0.5;
        if (conge.demiJourneeFin) jours -= 0.5;
        await db.updateSoldeConges(conge.technicienId, conge.artisanId, conge.type, new Date().getFullYear(), -jours);
      }
      await db.deleteConge(input.id);
      return { success: true };
    }),

  getSoldes: protectedProcedure
    .input(z.object({ technicienId: z.number(), annee: z.number() }))
    .query(async ({ ctx, input }) => {
      // SECURITE (OPE-31/OPE-45) : solde de congés = donnée RH d'un salarié.
      await assertTechnicienOwner(input.technicienId, ctx.user.id);
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
      // OPE-31/OPE-45 : le technicien doit appartenir au tenant appelant.
      const { artisan } = await assertTechnicienOwner(input.technicienId, ctx.user.id);
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.getHistoriqueCA(artisan.id, input.nombreMois);
    }),

  calculerHistorique: protectedProcedure.mutation(async ({ ctx }) => {
    let artisan = await db.getOrCreateArtisan(ctx.user.id);
    await db.calculerHistoriqueCAMensuel(artisan.id);
    return { success: true };
  }),

  seedHistorique: protectedProcedure
    .input(z.object({
      mois: z.number(),
      annee: z.number(),
      caTotal: z.string(),
      nombreFactures: z.number().default(0),
      nombreClients: z.number().default(0),
      panierMoyen: z.string().default("0"),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.seedHistoriqueCA(artisan.id, input);
    }),

  getPrevisions: protectedProcedure
    .input(z.object({ annee: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const annee = input?.annee || new Date().getFullYear();
      return await db.getPrevisionsCA(artisan.id, annee);
    }),

  calculer: protectedProcedure
    .input(z.object({ methode: z.enum(["moyenne_mobile", "regression_lineaire", "saisonnalite"]).default("moyenne_mobile") }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      // D'abord mettre à jour l'historique
      await db.calculerHistoriqueCAMensuel(artisan.id);
      // Puis calculer les prévisions
      return await db.calculerPrevisionsCA(artisan.id, input.methode);
    }),

  getComparaison: protectedProcedure
    .input(z.object({ annee: z.number() }))
    .query(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.getComparaisonPrevisionsRealise(artisan.id, input.annee);
    }),

  savePrevisionManuelle: protectedProcedure
    .input(z.object({
      mois: z.number(),
      annee: z.number(),
      caPrevisionnel: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.savePrevisionCA({
        artisanId: artisan.id,
        mois: input.mois,
        annee: input.annee,
        caPrevisionnel: input.caPrevisionnel,
        methodeCalcul: 'manuel',
      });
    }),

  // Alias getHistoriqueCA → getHistorique
  getHistoriqueCA: protectedProcedure
    .input(z.object({ nombreMois: z.number().default(24) }).optional())
    .query(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.getHistoriqueCA(artisan.id, input?.nombreMois || 24);
    }),
});

// ============================================================================
// VEHICULES ROUTER
// ============================================================================
// SECURITE (OPE-47) : vérifie que le véhicule appartient au tenant appelant. Les
// helpers DB (getVehiculeById/update/delete + sous-ressources kilométrage/entretien/
// assurance) ne scopent que par id -> sans cette garde, IDOR cross-tenant (lecture,
// écriture, suppression en cascade).
async function assertVehiculeOwner(vehiculeId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const veh = artisan ? await db.getVehiculeById(vehiculeId) : null;
  if (!veh || !artisan || (veh as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule non trouvé" });
  }
  return { veh, artisan };
}

const vehiculesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getOrCreateArtisan(ctx.user.id);
    return await db.getVehiculesByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.id, ctx.user.id);
      return await db.getVehiculeById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      immatriculation: z.string().max(20),
      marque: z.string().max(100).optional(),
      modele: z.string().max(100).optional(),
      annee: z.number().optional(),
      typeCarburant: z.enum(["essence", "diesel", "electrique", "hybride", "gpl"]).optional(),
      kilometrageActuel: z.number().optional(),
      dateAchat: z.string().optional(),
      prixAchat: z.string().optional(),
      technicienId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createVehicule({
        artisanId: artisan.id,
        ...input,
        dateAchat: input.dateAchat ? new Date(input.dateAchat) : undefined,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      immatriculation: z.string().max(20).optional(),
      marque: z.string().max(100).optional(),
      modele: z.string().max(100).optional(),
      annee: z.number().optional(),
      typeCarburant: z.enum(["essence", "diesel", "electrique", "hybride", "gpl"]).optional(),
      kilometrageActuel: z.number().optional(),
      technicienId: z.number().nullable().optional(),
      statut: z.enum(["actif", "en_maintenance", "hors_service", "vendu"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.id, ctx.user.id);
      const { id, ...data } = input;
      return await db.updateVehicule(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.id, ctx.user.id);
      return await db.deleteVehicule(input.id);
    }),

  addKilometrage: protectedProcedure
    .input(z.object({
      vehiculeId: z.number(),
      kilometrage: z.number(),
      dateReleve: z.string(),
      motif: z.string().max(255).optional(),
      technicienId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
      return await db.addHistoriqueKilometrage({
        ...input,
        dateReleve: new Date(input.dateReleve),
      });
    }),

  getHistoriqueKilometrage: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
      return await db.getHistoriqueKilometrageByVehicule(input.vehiculeId);
    }),

  addEntretien: protectedProcedure
    .input(z.object({
      vehiculeId: z.number(),
      type: z.enum(["vidange", "pneus", "freins", "controle_technique", "revision", "reparation", "autre"]),
      dateEntretien: z.string(),
      kilometrageEntretien: z.number().optional(),
      cout: z.string().optional(),
      prestataire: z.string().max(255).optional(),
      description: z.string().optional(),
      prochainEntretienKm: z.number().optional(),
      prochainEntretienDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
      return await db.createEntretienVehicule({
        ...input,
        dateEntretien: new Date(input.dateEntretien),
        prochainEntretienDate: input.prochainEntretienDate ? new Date(input.prochainEntretienDate) : undefined,
      });
    }),

  getEntretiens: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
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
      compagnie: z.string().max(255),
      numeroContrat: z.string().max(100).optional(),
      typeAssurance: z.enum(["tiers", "tiers_plus", "tous_risques"]).optional(),
      dateDebut: z.string(),
      dateFin: z.string(),
      primeAnnuelle: z.string().optional(),
      franchise: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
      return await db.createAssuranceVehicule({
        ...input,
        dateDebut: new Date(input.dateDebut),
        dateFin: new Date(input.dateFin),
      });
    }),

  getAssurances: protectedProcedure
    .input(z.object({ vehiculeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertVehiculeOwner(input.vehiculeId, ctx.user.id);
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
// OPE-47 — appartenance d'un badge au tenant appelant. `update`/`delete`
// prenaient un id de badge sans vérifier le propriétaire (handler `async ({ input })`
// sans `ctx`) → un artisan pouvait modifier/supprimer le badge d'un autre tenant
// (IDOR, cf. audit 2026-06-07-badges-gamification-idor). Même schéma que
// assertVehiculeOwner : NOT_FOUND si le badge n'appartient pas à l'appelant.
async function assertBadgeOwner(badgeId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const badge = artisan ? await db.getBadgeById(badgeId) : null;
  if (!badge || !artisan || (badge as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Badge non trouvé" });
  }
  return { badge, artisan };
}

const badgesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    let artisan = await db.getOrCreateArtisan(ctx.user.id);
    return await db.getBadgesByArtisan(artisan.id);
  }),

  create: protectedProcedure
    .input(z.object({
      // Bornes alignées sur la table `badges` (code 50, nom 100, icone 50, couleur 20)
      // — defense-in-depth contre une entrée surdimensionnée (erreur MySQL strict).
      code: z.string().max(50),
      nom: z.string().max(100),
      description: z.string().max(2000).optional(),
      icone: z.string().max(50).optional(),
      couleur: z.string().max(20).optional(),
      categorie: z.enum(["interventions", "avis", "ca", "anciennete", "special"]).optional(),
      condition: z.string().max(2000).optional(),
      seuil: z.number().optional(),
      points: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createBadge({ artisanId: artisan.id, ...input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().max(100).optional(),
      description: z.string().max(2000).optional(),
      icone: z.string().max(50).optional(),
      couleur: z.string().max(20).optional(),
      seuil: z.number().optional(),
      points: z.number().optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBadgeOwner(input.id, ctx.user.id);
      const { id, ...data } = input;
      return await db.updateBadge(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertBadgeOwner(input.id, ctx.user.id);
      return await db.deleteBadge(input.id);
    }),

  getBadgesTechnicien: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id); // OPE-31
      return await db.getBadgesTechnicien(input.technicienId);
    }),

  attribuerBadge: protectedProcedure
    .input(z.object({
      technicienId: z.number(),
      badgeId: z.number(),
      valeurAtteinte: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id); // OPE-31
      return await db.attribuerBadge(input.technicienId, input.badgeId, input.valeurAtteinte);
    }),

  verifierBadges: protectedProcedure
    .input(z.object({ technicienId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { artisan } = await assertTechnicienOwner(input.technicienId, ctx.user.id); // OPE-31
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
    .query(async ({ ctx, input }) => {
      await assertTechnicienOwner(input.technicienId, ctx.user.id); // OPE-31
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
      // OPE-31 : le technicien ciblé doit appartenir au tenant appelant.
      const { artisan } = await assertTechnicienOwner(input.technicienId, ctx.user.id);
      return await db.createObjectifTechnicien({ artisanId: artisan.id, ...input });
    }),
});

// ============================================================================
// CHANTIERS MULTI-INTERVENTIONS ROUTER
// SECURITE : chaque endpoint qui prend un chantierId / id / phaseId /
// documentId / suiviId valide l'ownership via le helper assertChantierOwner
// (ou via les helpers getXxxById + check chantier parent pour les sous-ressources).
// ============================================================================

async function assertChantierOwner(chantierId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const chantier = artisan ? await db.getChantierById(chantierId) : null;
  if (!chantier || !artisan || chantier.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chantier non trouve" });
  }
  return { chantier, artisan };
}

const chantiersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getChantiersByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { chantier } = await assertChantierOwner(input.id, ctx.user.id);
      return chantier;
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      // Bornes texte alignées sur les colonnes de `chantiers` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      reference: z.string().max(50),
      nom: z.string().max(255),
      description: z.string().max(2000).optional(),
      adresse: z.string().max(500).optional(),
      codePostal: z.string().max(10).optional(),
      ville: z.string().max(100).optional(),
      dateDebut: z.string().optional(),
      dateFinPrevue: z.string().optional(),
      budgetPrevisionnel: z.string().optional(),
      priorite: z.enum(["basse", "normale", "haute", "urgente"]).optional(),
      notes: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
      nom: z.string().max(255).optional(),
      description: z.string().max(2000).optional(),
      statut: z.enum(["planifie", "en_cours", "en_pause", "termine", "annule"]).optional(),
      avancement: z.number().optional(),
      dateFinReelle: z.string().optional(),
      budgetRealise: z.string().optional(),
      notes: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.id, ctx.user.id);
      const { id, dateFinReelle, ...rest } = input;
      return await db.updateChantier(id, {
        ...rest,
        dateFinReelle: dateFinReelle ? new Date(dateFinReelle) : undefined,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.id, ctx.user.id);
      return await db.deleteChantier(input.id);
    }),

  // Phases
  getPhases: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      // SECURITE : on charge la phase pour recuperer son chantierId puis on check.
      const phase = await db.getPhaseChantierById(input.id);
      if (!phase) throw new TRPCError({ code: "NOT_FOUND", message: "Phase non trouvee" });
      await assertChantierOwner(phase.chantierId, ctx.user.id);
      const { id, dateDebutReelle, dateFinReelle, ...rest } = input;
      return await db.updatePhaseChantier(id, {
        ...rest,
        dateDebutReelle: dateDebutReelle ? new Date(dateDebutReelle) : undefined,
        dateFinReelle: dateFinReelle ? new Date(dateFinReelle) : undefined,
      });
    }),

  deletePhase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const phase = await db.getPhaseChantierById(input.id);
      if (!phase) throw new TRPCError({ code: "NOT_FOUND", message: "Phase non trouvee" });
      await assertChantierOwner(phase.chantierId, ctx.user.id);
      return await db.deletePhaseChantier(input.id);
    }),

  // Interventions
  getInterventions: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      // SECURITE : verifier que LES DEUX ressources (chantier ET intervention)
      // appartiennent au meme artisan, sinon on permettrait d'associer
      // une intervention d'un autre artisan a son propre chantier.
      const { artisan } = await assertChantierOwner(input.chantierId, ctx.user.id);
      const intervention = await db.getInterventionById(input.interventionId);
      if (!intervention || intervention.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvee" });
      }
      return await db.associerInterventionChantier(input);
    }),

  dissocierIntervention: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      interventionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.dissocierInterventionChantier(input.chantierId, input.interventionId);
    }),

  // Documents
  getDocuments: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.addDocumentChantier(input);
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await db.getDocumentChantierById(input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document non trouve" });
      await assertChantierOwner(doc.chantierId, ctx.user.id);
      return await db.deleteDocumentChantier(input.id);
    }),

  // Statistiques
  getStatistiques: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.getStatistiquesChantier(input.chantierId);
    }),

  calculerAvancement: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.calculerAvancementChantier(input.chantierId);
    }),

  // Suivi chantier temps réel
  getSuivi: protectedProcedure
    .input(z.object({ chantierId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.getSuiviByChantier(input.chantierId);
    }),

  createSuivi: protectedProcedure
    .input(z.object({
      chantierId: z.number(),
      // Bornes texte alignées sur `suivi_chantier` (titre VARCHAR 255 ; description/
      // commentaire TEXT) — évite qu'un titre surdimensionné fasse échouer l'insert.
      titre: z.string().max(255),
      description: z.string().max(5000).optional(),
      statut: z.enum(["a_faire", "en_cours", "termine"]).optional(),
      pourcentage: z.number().min(0).max(100).optional(),
      ordre: z.number().optional(),
      visibleClient: z.boolean().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      commentaire: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertChantierOwner(input.chantierId, ctx.user.id);
      return await db.createSuiviChantier({
        ...input,
        dateDebut: input.dateDebut ? new Date(input.dateDebut) : undefined,
        dateFin: input.dateFin ? new Date(input.dateFin) : undefined,
      });
    }),

  updateSuivi: protectedProcedure
    .input(z.object({
      id: z.number(),
      titre: z.string().optional(),
      description: z.string().optional(),
      statut: z.enum(["a_faire", "en_cours", "termine"]).optional(),
      pourcentage: z.number().min(0).max(100).optional(),
      ordre: z.number().optional(),
      visibleClient: z.boolean().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const suivi = await db.getSuiviChantierById(input.id);
      if (!suivi) throw new TRPCError({ code: "NOT_FOUND", message: "Suivi non trouve" });
      await assertChantierOwner(suivi.chantierId, ctx.user.id);
      const { id, ...data } = input;
      return await db.updateSuiviChantier(id, {
        ...data,
        dateDebut: data.dateDebut ? new Date(data.dateDebut) : undefined,
        dateFin: data.dateFin ? new Date(data.dateFin) : undefined,
      });
    }),

  deleteSuivi: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const suivi = await db.getSuiviChantierById(input.id);
      if (!suivi) throw new TRPCError({ code: "NOT_FOUND", message: "Suivi non trouve" });
      await assertChantierOwner(suivi.chantierId, ctx.user.id);
      return await db.deleteSuiviChantier(input.id);
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);

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
        // Générateur FEC unique et conforme (18 colonnes, journaux VE/AC/BQ,
        // TVA par taux, ValidDate) — même source que /api/comptabilite/fec.
        contenu = (await db.genererFEC(artisan.id, dateDebut, dateFin)).content;
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
// SECURITE (OPE-30) : analyses_photos_chantier porte un artisanId ; les helpers
// (getAnalysePhotoById/getPhotosByAnalyse/updateAnalysePhoto/addPhotoToAnalyse) ne
// scopent que par id -> sans cette garde, IDOR (lecture/écriture/analyse des photos
// d'un autre tenant).
async function assertAnalyseOwner(analyseId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const analyse = artisan ? await db.getAnalysePhotoById(analyseId) : null;
  if (!analyse || !artisan || (analyse as any).artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Analyse non trouvée" });
  }
  return { analyse, artisan };
}

const devisIARouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getAnalysesPhotosByArtisan(artisan.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { analyse } = await assertAnalyseOwner(input.id, ctx.user.id);

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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createAnalysePhoto({ artisanId: artisan.id, ...input });
    }),

  addPhoto: protectedProcedure
    .input(z.object({
      analyseId: z.number(),
      url: z.string(),
      description: z.string().optional(),
      ordre: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAnalyseOwner(input.analyseId, ctx.user.id);
      return await db.addPhotoToAnalyse(input);
    }),

  analyserPhotos: protectedProcedure
    .input(z.object({ analyseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan non trouvé" });
      }
      // OPE-24 — rate-limit IA (vision multimodale = l'appel le plus coûteux) ;
      // était le seul endpoint IA sans borne, contrairement à tous ses pairs.
      if (!checkRateLimit(artisan.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });
      }

      // SECURITE (OPE-30) : l'analyse doit appartenir au tenant appelant (sinon
      // analyse/altération du statut des photos d'un autre tenant).
      const analyseOwn = await db.getAnalysePhotoById(input.analyseId);
      if (!analyseOwn || (analyseOwn as any).artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analyse non trouvée" });
      }

      // Sanitizer global : enleve toute data: URL et tronque a 200 chars pour
      // qu'aucune erreur remontee au frontend ne contienne le payload base64
      // de l'image (qui faisait apparaitre 'long base64' dans les toasts).
      const sanitizeErr = (e: any): string => {
        let msg = String(e?.message || e || 'Erreur inconnue');
        msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]');
        if (msg.length > 200) msg = msg.slice(0, 200) + '…';
        return msg;
      };

      // Mettre à jour le statut
      await db.updateAnalysePhoto(input.analyseId, { statut: 'en_cours' });

      const photos = await db.getPhotosByAnalyse(input.analyseId);
      if (photos.length === 0) {
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune photo à analyser" });
      }

      // Build image parts for Gemini multimodal.
      // Supporte les 2 formes d'image :
      // - Data URL (base64) -> inlineData
      // - URL HTTP(S) publique -> fileData
      const imageBlocks = photos.map((p: any) => {
        const m = String(p.url || "").match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
        if (m) {
          return { inlineData: { mimeType: m[1], data: m[2] } };
        }
        return { fileData: { mimeType: 'image/jpeg', fileUri: p.url } };
      });

      // T4 : prompt specialise par metier — l'IA devient un expert
      // carreleur/plombier/paysagiste/etc. au lieu d'un generaliste, ce
      // qui donne des quantites + prix + marques plus realistes.
      const metierArtisan = metierFromArtisan(artisan);
      const contexteMetier = getContexteMetier(metierArtisan);

      const PROMPTS_METIER: Record<string, string> = {
        carreleur: "Analyse cette photo comme un expert carreleur. Calcule la surface a carreler visible. Identifie le type de support (mur/sol/humide). Propose le carrelage adapte. Calcule les quantites (carrelage + colle + joint + pertes 15%). Liste tous les materiaux avec prix realistes.",
        paysagiste: "Analyse ce jardin/espace exterieur. Estime la surface totale visible. Identifie la vegetation existante. Propose un plan d'amenagement adapte. Liste les plantes recommandees avec quantites. Calcule le volume de terre/mulch necessaire.",
        cuisiniste: "Analyse cette cuisine. Estime les dimensions (lineaire des murs). Identifie le type d'agencement actuel. Propose 2-3 options de renovation. Liste meubles, plan de travail, electromenager recommandes.",
        macon: "Analyse cette surface/structure. Calcule les volumes/surfaces visibles. Identifie les travaux necessaires. Calcule les quantites de materiaux : beton, parpaings, enduit, isolation. Estime la main d'oeuvre.",
        peintre: "Analyse cette piece/surface a peindre. Calcule la surface totale (murs + plafond). Deduis les ouvertures. Identifie l'etat (preparation necessaire ?). Calcule les quantites de peinture (rendement 8-12m²/L, 2 couches).",
        plombier: "Analyse cette installation plomberie/sanitaire. Identifie les equipements visibles. Repere les problemes potentiels. Liste les travaux a effectuer. Propose les equipements de remplacement avec marques (Grohe, Hansgrohe…) et prix marche.",
        electricien: "Analyse cette installation electrique. Identifie tableau, prises, eclairage, conformite NF C 15-100. Liste les travaux de mise aux normes. Propose les materiels avec marques (Legrand, Schneider, Hager) et prix marche.",
        menuisier: "Analyse cette ouvrage bois/menuiserie. Mesure les dimensions visibles. Identifie le type de bois et l'etat. Propose les travaux + bois adapte avec prix marche.",
        chauffagiste: "Analyse cette installation chauffage/climatisation. Identifie l'equipement existant. Calcule les deperditions visibles. Propose la solution adaptee (PAC, chaudiere, radiateurs) avec marques + prix.",
        terrassier: "Analyse cette zone de terrassement. Estime volumes a deplacer en m³. Identifie l'acces engins, les reseaux. Propose le materiel necessaire + prix.",
      };

      const promptSpecialise = metierArtisan && PROMPTS_METIER[String(metierArtisan).toLowerCase()]
        ? PROMPTS_METIER[String(metierArtisan).toLowerCase()]
        : "Analyse les photos fournies et identifie les travaux necessaires.";

      const systemPrompt = `${contexteMetier}

${promptSpecialise}

Pour chaque type de travaux detecte, fournis :
- Le type (ex: plomberie, electricite, peinture)
- Une description detaillee
- Le niveau d'urgence (faible | moyenne | haute | critique)
- Un score de confiance 0-100
- La liste des articles/materiaux necessaires (nom, description, quantite, unite, prixEstime EN EUROS TTC marche francais 2024)

Reponds UNIQUEMENT avec un objet JSON brut (pas de markdown, pas de texte autour) :
{"travaux":[{"type":"string","description":"string","urgence":"faible|moyenne|haute|critique","confiance":0,"articles":[{"nom":"string","description":"string","quantite":0,"unite":"string","prixEstime":0}]}]}`;

      // Appel Gemini multimodal dans try/catch pour ne JAMAIS laisser remonter
      // le payload d'image base64 dans la stack d'erreur tRPC.
      let responseText = '';
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [
            ...imageBlocks,
            { text: "Analyse ces photos de chantier et identifie les travaux nécessaires." },
          ] }],
          config: { systemInstruction: systemPrompt, temperature: 0.3, maxOutputTokens: 4000 },
        });
        responseText = response.text || '';
      } catch (e: any) {
        console.warn('[analyserPhotos] Gemini call failed:', e?.status, e?.name);
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Appel IA echoue : ${sanitizeErr(e)}`,
        });
      }

      // Parse JSON robuste : supporte markdown wrap ```json ... ```
      // et eventuels prefixes/suffixes en texte naturel.
      let cleaned = responseText.trim();
      const codeFence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeFence) cleaned = codeFence[1].trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reponse IA non parsable" });
      }

      let analyseResult: any;
      try {
        analyseResult = JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `JSON IA invalide : ${sanitizeErr(e)}` });
      }
      if (!Array.isArray(analyseResult?.travaux)) {
        await db.updateAnalysePhoto(input.analyseId, { statut: 'erreur' });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Format de reponse IA inattendu (champ 'travaux' absent)" });
      }

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
          // (Fetch biblio une seule fois hors de la boucle pour eviter le
          // SELECT N+1, et utiliser le champ 'nom' qui est celui de la
          // table bibliotheque_articles — l'ancien code lisait a.designation
          // qui est undefined sur ce type et crashait toute la mutation.)
          const articlesExistants = await db.getBibliothequeArticles();
          for (const article of travail.articles || []) {
            const nomIA = String(article?.nom || '').toLowerCase();
            const articleMatch = nomIA
              ? articlesExistants.find((a: any) => {
                  const nomBiblio = String(a?.nom || a?.designation || '').toLowerCase();
                  if (!nomBiblio) return false;
                  return nomBiblio.includes(nomIA) || nomIA.includes(nomBiblio);
                })
              : undefined;

            await db.saveSuggestionArticleIA({
              resultatId: resultat.id,
              articleId: articleMatch?.id,
              nomArticle: article?.nom || '',
              description: article?.description || '',
              quantiteSuggeree: String(article?.quantite ?? '1'),
              unite: article?.unite || 'unité',
              prixEstime: String(article?.prixEstime ?? '0'),
              confiance: String(travail?.confiance ?? '0'),
            });
          }
        }
      }

      // Mettre à jour le statut
      await db.updateAnalysePhoto(input.analyseId, { statut: 'termine' });

      return {
        success: true,
        nombreTravaux: Array.isArray(analyseResult.travaux) ? analyseResult.travaux.length : 0,
      };
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
      return await db.creerDevisDepuisAnalyseIA({
        analyseId: input.analyseId,
        clientId: input.clientId,
        artisanId: artisan.id,
      });
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
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
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
// ASSISTANT IA ROUTER
// ============================================================================
const assistantRouter = router({
  chat: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      if (!checkRateLimit(artisan.id)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite de 30 requêtes/heure atteinte" });

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
      const systemPrompt = await buildSystemPrompt(artisan.id);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: input.message }] }],
        config: { systemInstruction: systemPrompt, maxOutputTokens: 2000, temperature: 0.7 },
      });
      const text = response.text || '';
      return { response: text };
    }),

  generateDevis: protectedProcedure
    .input(z.object({ description: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      if (!checkRateLimit(artisan.id)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });

      const articles = await db.getArticlesArtisan(artisan.id);
      const biblio = await db.getBibliothequeArticles(artisan.metier || undefined);
      const catalogue = [...articles.map(a => `${a.designation || a.nom} - ${a.prixUnitaireHT || a.prixBase}€/${a.unite}`),
        ...biblio.slice(0, 50).map((a: any) => `${a.nom} - ${a.prix_base}€/${a.unite}`)].join('\n');

      const { GoogleGenAI: GenAI2 } = await import('@google/genai');
      const ai2 = new GenAI2({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai2.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Génère les lignes de devis pour : ${input.description}` }] }],
        config: {
          systemInstruction: `Tu es un assistant spécialisé dans la génération de devis pour artisans. Tu dois générer des lignes de devis au format JSON.
Catalogue d'articles disponibles :\n${catalogue}\n\nRéponds UNIQUEMENT avec un tableau JSON (pas de texte autour) au format :
[{"designation":"...","quantite":1,"unite":"u","prixUnitaireHT":0,"tauxTVA":20}]`,
          temperature: 0.3,
          maxOutputTokens: 2000,
        },
      });
      const text = response.text || '';
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const lignes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        return { lignes, raw: text };
      } catch {
        return { lignes: [], raw: text };
      }
    }),

  suggestRelances: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    if (!checkRateLimit(artisan.id)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });

    const devisNonSignes = await db.getDevisNonSignes(artisan.id);
    const devisARelancer = [];
    for (const d of devisNonSignes) {
      const jours = Math.floor((Date.now() - new Date(d.dateDevis).getTime()) / 86400000);
      if (jours < 7) continue;
      const cl = await db.getClientById(d.clientId);
      devisARelancer.push({ numero: d.numero, objet: d.objet, totalTTC: d.totalTTC, jours, client: cl ? `${cl.prenom || ''} ${cl.nom}`.trim() : 'Client', email: cl?.email });
    }
    if (devisARelancer.length === 0) return [];

    const liste = devisARelancer.map(d => `- Devis ${d.numero} (${d.objet || 'sans objet'}) : ${d.totalTTC}€ TTC, envoyé il y a ${d.jours} jours à ${d.client}`).join('\n');
    const { GoogleGenAI: GenAI3 } = await import('@google/genai');
    const ai3 = new GenAI3({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai3.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Génère des emails de relance pour ces devis :\n${liste}` }] }],
      config: {
        systemInstruction: `Tu es un assistant qui génère des emails de relance professionnels et personnalisés pour un artisan. Pour chaque devis, génère un email court et cordial. Réponds en JSON : [{"numero":"...","objet":"...","email":{"sujet":"...","corps":"..."}}]`,
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    });
    const text = response.text || '';
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return [{ error: text }];
    }
  }),

  analyseRentabilite: protectedProcedure
    .input(z.object({ devisId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      if (!checkRateLimit(artisan.id)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });

      const devisData = await db.getDevisById(input.devisId);
      if (!devisData || devisData.artisanId !== artisan.id) throw new TRPCError({ code: "NOT_FOUND", message: "Devis non trouvé" });
      const lignes = await db.getLignesDevisByDevisId(devisData.id);
      const cl = await db.getClientById(devisData.clientId);
      const articles = await db.getArticlesArtisan(artisan.id);

      const detailLignes = lignes.map(l => `- ${l.designation}: ${l.quantite} ${l.unite} x ${l.prixUnitaireHT}€ HT (TVA ${l.tauxTVA}%)`).join('\n');
      const prixRef = articles.slice(0, 30).map(a => `${a.designation || a.nom}: ${a.prixUnitaireHT || a.prixBase}€/${a.unite}`).join('\n');

      const { GoogleGenAI: GenAI4 } = await import('@google/genai');
      const ai4 = new GenAI4({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai4.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Analyse ce devis :\nDevis ${devisData.numero} pour ${cl ? `${cl.prenom || ''} ${cl.nom}`.trim() : 'client'}\nTotal HT: ${devisData.totalHT}€ | Total TTC: ${devisData.totalTTC}€\n\nLignes :\n${detailLignes}\n\nTarifs habituels de l'artisan :\n${prixRef || 'Non disponibles'}` }] }],
        config: {
          systemInstruction: `Tu es un expert en analyse de rentabilité pour artisans. Analyse ce devis, compare les prix aux tarifs habituels, estime la marge, et donne des recommandations concrètes. Réponds en français avec du markdown.`,
          temperature: 0.5,
          maxOutputTokens: 2000,
        },
      });
      return { analyse: response.text || '' };
    }),

  predictionTresorerie: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    if (!checkRateLimit(artisan.id)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });

    const factures = await db.getFacturesByArtisanId(artisan.id);
    const devisList = await dbSecure.getDevisByArtisanIdSecure(artisan.id);

    const facturesPayees = factures.filter(f => f.statut === 'payee').slice(0, 20).map(f => `FAC ${f.numero}: ${f.totalTTC}€ payée le ${f.datePaiement || f.createdAt}`).join('\n');
    const facturesImpayees = factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').map(f => `FAC ${f.numero}: ${f.totalTTC}€ (${f.statut}) échéance ${f.dateEcheance || 'non définie'}`).join('\n');
    const devisAcceptes = devisList.filter(d => d.statut === 'accepte').map(d => `DEV ${d.numero}: ${d.totalTTC}€`).join('\n');

    const { GoogleGenAI: GenAI5 } = await import('@google/genai');
    const ai5 = new GenAI5({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai5.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Données financières :\n\nFactures payées récentes :\n${facturesPayees || 'Aucune'}\n\nFactures impayées :\n${facturesImpayees || 'Aucune'}\n\nDevis acceptés (à facturer) :\n${devisAcceptes || 'Aucun'}` }] }],
      config: {
        systemInstruction: `Tu es un expert en gestion de trésorerie pour artisans. Analyse les données financières et prédit les entrées/sorties sur les 3 prochains mois. Donne des alertes si tension de trésorerie. Réponds en français avec du markdown.`,
        temperature: 0.5,
        maxOutputTokens: 2000,
      },
    });
    return { prediction: response.text || '' };
  }),

  getThreads: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return db.listAiThreads(artisan.id, 20);
  }),

  getMessages: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      // Verify thread belongs to artisan
      const thread = await db.getAiThread(input.threadId, artisan.id);
      if (!thread) return [];
      return db.getAiMessages(input.threadId, 100);
    }),
});

// ============================================================================
// STATISTIQUES ROUTER
// ============================================================================
const statistiquesRouter = router({
  getDevisStats: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { total: 0, parStatut: {}, montantTotal: 0 };
    const allDevis = await dbSecure.getDevisByArtisanIdSecure(artisan.id);
    const parStatut: Record<string, number> = {};
    let montantTotal = 0;
    for (const d of allDevis) {
      parStatut[d.statut || 'brouillon'] = (parStatut[d.statut || 'brouillon'] || 0) + 1;
      montantTotal += parseFloat(d.totalTTC?.toString() || '0');
    }
    return { total: allDevis.length, parStatut, montantTotal };
  }),

  getFacturesStats: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { total: 0, parStatut: {}, montantPaye: 0, montantImpaye: 0 };
    const allFactures = await db.getFacturesByArtisanId(artisan.id);
    const parStatut: Record<string, number> = {};
    let montantPaye = 0;
    let montantImpaye = 0;
    for (const f of allFactures) {
      parStatut[f.statut || 'brouillon'] = (parStatut[f.statut || 'brouillon'] || 0) + 1;
      const ttc = parseFloat(f.totalTTC?.toString() || '0');
      if (f.statut === 'payee') montantPaye += ttc;
      else if (f.statut !== 'annulee') montantImpaye += ttc;
    }
    return { total: allFactures.length, parStatut, montantPaye, montantImpaye };
  }),

  getCAMensuel: protectedProcedure
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getMonthlyCAStats(artisan.id, input?.months || 12);
    }),

  getTopClients: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getTopClients(artisan.id, input?.limit || 5);
    }),

  getTauxConversion: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { totalDevis: 0, devisAcceptes: 0, rate: 0 };
    return await db.getConversionRate(artisan.id);
  }),
});

// ============================================================================
// RELANCES ROUTER
// ============================================================================
const relancesRouter = router({
  list: protectedProcedure
    .input(z.object({ joursMinimum: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const joursMinimum = input?.joursMinimum || 7;
      const allDevis = await db.getDevisNonSignes(artisan.id);
      const results = [];
      for (const d of allDevis) {
        const joursDepuisCreation = Math.floor((Date.now() - new Date(d.dateDevis).getTime()) / (1000 * 60 * 60 * 24));
        if (joursDepuisCreation < joursMinimum) continue;
        const client = await db.getClientById(d.clientId);
        const signature = await db.getSignatureByDevisId(d.id);
        results.push({
          devis: { id: d.id, numero: d.numero, dateDevis: d.dateDevis, totalTTC: d.totalTTC, statut: d.statut },
          client: client ? { id: client.id, nom: `${client.prenom || ''} ${client.nom}`.trim(), email: client.email } : null,
          signature: signature ? { id: signature.id, token: signature.token, createdAt: signature.createdAt } : null,
          joursDepuisCreation,
          joursDepuisEnvoi: signature ? Math.floor((Date.now() - new Date(signature.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : null,
        });
      }
      return results;
    }),
});

// ============================================================================
// PORTAIL ROUTER (artisan-side portal management)
// ============================================================================
const portailRouter = router({
  listClients: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const allClients = await db.getClientsByArtisanId(artisan.id);
    const results = [];
    for (const client of allClients) {
      const access = await db.getPortalAccessByClientId(client.id, artisan.id);
      let statut = 'inactif';
      if (access) {
        if (!access.isActive) statut = 'desactive';
        else if (access.expiresAt && new Date(access.expiresAt) < new Date()) statut = 'expire';
        else statut = 'actif';
      }
      results.push({
        id: client.id,
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
        telephone: client.telephone,
        statut,
        portalToken: (access && access.isActive && (!access.expiresAt || new Date(access.expiresAt) >= new Date())) ? access.token : null,
        lastAccessAt: access?.lastAccessAt || null,
        expiresAt: access?.expiresAt || null,
      });
    }
    return results;
  }),
});

// ============================================================================
// CALENDRIER ROUTER
// ============================================================================
const calendrierRouter = router({
  // OPE-156 — flux iCal : renvoie (en le générant à la 1ʳᵉ fois) le chemin d'abonnement
  // au calendrier des interventions. Le front préfixe l'origine pour l'URL complète.
  getIcalFeed: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    let token = (artisan as any).icalToken as string | null;
    if (!token) {
      token = randomBytes(24).toString("hex"); // 48 hex chars, non devinable
      await db.updateArtisan(artisan.id, { icalToken: token } as any);
    }
    return { path: `/api/calendar/${token}.ics` };
  }),

  // Régénère le jeton (révoque l'ancien lien d'abonnement).
  regenerateIcalFeed: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    const token = randomBytes(24).toString("hex");
    await db.updateArtisan(artisan.id, { icalToken: token } as any);
    return { path: `/api/calendar/${token}.ics` };
  }),

  getEvents: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      const interventionsList = await dbSecure.getInterventionsByArtisanIdSecure(artisan.id);
      const events = [];
      for (const intervention of interventionsList) {
        if (input?.dateDebut && new Date(intervention.dateDebut) < new Date(input.dateDebut)) continue;
        if (input?.dateFin && new Date(intervention.dateDebut) > new Date(input.dateFin)) continue;
        const client = await db.getClientById(intervention.clientId);
        const technicien = intervention.technicienId ? await db.getTechnicienById(intervention.technicienId) : null;
        events.push({
          id: intervention.id,
          title: intervention.titre,
          start: intervention.dateDebut,
          end: intervention.dateFin || intervention.dateDebut,
          statut: intervention.statut,
          type: 'intervention',
          client: client ? { id: client.id, nom: `${client.prenom || ''} ${client.nom}`.trim() } : null,
          technicien: technicien ? { id: technicien.id, nom: `${technicien.prenom || ''} ${technicien.nom}`.trim(), couleur: technicien.couleur } : null,
          adresse: intervention.adresse,
        });
      }
      return events;
    }),
});

// ============================================================================
// RDV EN LIGNE ROUTER (Artisan side - protected)
// ============================================================================
const rdvRouter = router({
  list: protectedProcedure
    .input(z.object({
      statut: z.enum(["en_attente", "confirme", "refuse", "annule"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      let rdvList = await db.getRdvByArtisanId(artisan.id);
      if (input?.statut) {
        rdvList = rdvList.filter(r => r.statut === input.statut);
      }
      return Promise.all(rdvList.map(async (r) => {
        const client = await db.getClientById(r.clientId);
        return { ...r, client };
      }));
    }),

  confirm: protectedProcedure
    .input(z.object({ rdvId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouve" });

      const rdv = await db.getRdvById(input.rdvId);
      if (!rdv || rdv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "RDV non trouve" });
      }
      if (rdv.statut !== "en_attente") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce RDV ne peut plus etre confirme" });
      }

      const dateFin = new Date(rdv.dateProposee.getTime() + (rdv.dureeEstimee || 60) * 60000);
      const intervention = await db.createIntervention({
        artisanId: artisan.id,
        clientId: rdv.clientId,
        titre: rdv.titre,
        description: rdv.description || undefined,
        dateDebut: rdv.dateProposee,
        dateFin,
        statut: "planifiee",
      });

      const updated = await db.updateRdvStatut(rdv.id, "confirme", { interventionId: intervention.id });

      const client = await db.getClientById(rdv.clientId);
      if (client?.email) {
        const clientName = `${client.prenom || ''} ${client.nom}`.trim();
        const artisanName = artisan.nomEntreprise || 'Votre artisan';
        const dateStr = rdv.dateProposee.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        await sendEmail({
          to: client.email,
          subject: `${artisanName} — Votre RDV est confirme`,
          body: `<p>Bonjour ${safeHtml(clientName)},</p><p>Votre rendez-vous <strong>${safeHtml(rdv.titre)}</strong> du <strong>${dateStr}</strong> a ete confirme.</p><p>Cordialement,<br/>${safeHtml(artisanName)}</p>`,
        });
      }

      return updated;
    }),

  refuse: protectedProcedure
    .input(z.object({ rdvId: z.number(), motif: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouve" });

      const rdv = await db.getRdvById(input.rdvId);
      if (!rdv || rdv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "RDV non trouve" });
      }

      const updated = await db.updateRdvStatut(rdv.id, "refuse", { motifRefus: input.motif });

      const client = await db.getClientById(rdv.clientId);
      if (client?.email) {
        const clientName = `${client.prenom || ''} ${client.nom}`.trim();
        const artisanName = artisan.nomEntreprise || 'Votre artisan';
        await sendEmail({
          to: client.email,
          subject: `${artisanName} — RDV non disponible`,
          body: `<p>Bonjour ${safeHtml(clientName)},</p><p>Votre demande de rendez-vous <strong>${safeHtml(rdv.titre)}</strong> n'a malheureusement pas pu etre acceptee.</p><p><strong>Motif :</strong> ${safeHtml(input.motif)}</p><p>N'hesitez pas a proposer un autre creneau.</p><p>Cordialement,<br/>${safeHtml(artisanName)}</p>`,
        });
      }

      return updated;
    }),

  proposeAutreCreneau: protectedProcedure
    .input(z.object({ rdvId: z.number(), nouvelleDateProposee: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouve" });

      const rdv = await db.getRdvById(input.rdvId);
      if (!rdv || rdv.artisanId !== artisan.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "RDV non trouve" });
      }

      await db.updateRdvStatut(rdv.id, "refuse", {
        motifRefus: "Creneau non disponible — un autre creneau a ete propose",
      });

      const newRdv = await db.createRdvEnLigne({
        artisanId: artisan.id,
        clientId: rdv.clientId,
        titre: rdv.titre,
        description: rdv.description,
        dateProposee: new Date(input.nouvelleDateProposee),
        dureeEstimee: rdv.dureeEstimee,
        urgence: rdv.urgence || "normale",
      });

      const client = await db.getClientById(rdv.clientId);
      if (client?.email) {
        const clientName = `${client.prenom || ''} ${client.nom}`.trim();
        const artisanName = artisan.nomEntreprise || 'Votre artisan';
        const newDateStr = new Date(input.nouvelleDateProposee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        await sendEmail({
          to: client.email,
          subject: `${artisanName} — Nouveau creneau propose`,
          body: `<p>Bonjour ${safeHtml(clientName)},</p><p>Le creneau initialement demande n'est pas disponible. Un nouveau creneau vous est propose :</p><p><strong>${newDateStr}</strong></p><p>Connectez-vous a votre espace client pour confirmer.</p><p>Cordialement,<br/>${safeHtml(artisanName)}</p>`,
        });
      }

      return newRdv;
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { enAttente: 0, confirmes: 0, refuses: 0 };
    const all = await db.getRdvByArtisanId(artisan.id);
    return {
      enAttente: all.filter(r => r.statut === "en_attente").length,
      confirmes: all.filter(r => r.statut === "confirme").length,
      refuses: all.filter(r => r.statut === "refuse").length,
    };
  }),

  getPendingCount: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return 0;
    return db.getRdvPendingCount(artisan.id);
  }),
});

// ============================================================================
// MAIN APP ROUTER
// ============================================================================
// ============================================================================
// VITRINE ROUTER (Public showcase pages)
// ============================================================================
const vitrineRouter = router({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const artisan = await db.getArtisanBySlug(input.slug);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Page vitrine non trouvee" });

      const parametres = await db.getParametresArtisan(artisan.id);
      if (!parametres?.vitrineActive) throw new TRPCError({ code: "NOT_FOUND", message: "Cette vitrine n'est pas active" });

      const avisRaw = await db.getPublishedAvisByArtisanId(artisan.id);
      const avis = await Promise.all(avisRaw.map(async (a: any) => {
        const client = await db.getClientById(a.clientId);
        return {
          id: a.id, note: a.note, commentaire: a.commentaire,
          reponseArtisan: a.reponseArtisan, reponseAt: a.reponseAt, createdAt: a.createdAt,
          clientNom: client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Client',
        };
      }));

      const avisStats = await db.getPublishedAvisStats(artisan.id);
      const publicStats = await db.getVitrinePublicStats(artisan.id);

      const articles = await db.getArticlesArtisan(artisan.id);
      const categories = [...new Set(articles.map((a: any) => a.categorie).filter(Boolean))];

      let services: string[] = [];
      try { services = parametres.vitrineServices ? JSON.parse(parametres.vitrineServices as string) : []; } catch { services = []; }

      return {
        artisan: {
          nomEntreprise: artisan.nomEntreprise, specialite: artisan.specialite,
          telephone: artisan.telephone, email: artisan.email,
          ville: artisan.ville, codePostal: artisan.codePostal, adresse: artisan.adresse,
          siret: artisan.siret, logo: artisan.logo,
        },
        vitrine: {
          description: parametres.vitrineDescription,
          zone: parametres.vitrineZone,
          services: services.length > 0 ? services : categories,
          experience: parametres.vitrineExperience,
        },
        avis, avisStats, publicStats,
      };
    }),

  submitContact: publicProcedure
    .input(z.object({
      slug: z.string().min(1).max(200),
      nom: z.string().min(1).max(200),
      email: z.string().email().max(320),
      telephone: z.string().max(30).optional(),
      message: z.string().min(10).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      const artisan = await db.getArtisanBySlug(input.slug);
      if (!artisan || !artisan.email) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouve" });

      // OPE-36 — anti-flood par IP (5 msg / 15 min) : borne l'inondation de la boîte
      // artisan + les coûts Resend depuis un même émetteur (l'injection HTML est déjà
      // traitée via safeHtml ci-dessous). Un visiteur légitime (1 message) n'est pas affecté.
      const contactIp = String(
        (ctx.req?.headers?.['cf-connecting-ip'] as string)
        || ((ctx.req?.headers?.['x-forwarded-for'] as string) || '').split(',')[0].trim()
        || ctx.req?.socket?.remoteAddress || 'unknown'
      );
      if (!checkPublicContactRate(contactIp)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de messages envoyés. Réessayez dans quelques minutes." });
      }

      await sendEmail({
        to: artisan.email,
        subject: `Nouveau contact via votre vitrine - ${input.nom}`,
        body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#1e40af;">Nouveau message depuis votre page vitrine</h2>
          <p><strong>Nom :</strong> ${safeHtml(input.nom)}</p>
          <p><strong>Email :</strong> ${safeHtml(input.email)}</p>
          ${input.telephone ? `<p><strong>Telephone :</strong> ${safeHtml(input.telephone)}</p>` : ''}
          <hr style="border:1px solid #e5e7eb;margin:20px 0;" />
          <p>${safeHtml(input.message)}</p>
          <hr style="border:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#6b7280;font-size:12px;">Message envoye depuis votre page vitrine Operioz</p>
        </body></html>`,
      });

      await db.createNotification({
        artisanId: artisan.id, type: 'info',
        titre: 'Nouveau contact vitrine',
        message: `${input.nom} vous a envoye un message via votre page vitrine`,
        lien: '/parametres',
      });

      return { success: true };
    }),

  checkSlug: protectedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      return { available: await db.isSlugAvailable(input.slug, artisan?.id) };
    }),
});

// ============================================================================
// UTILISATEURS ROUTER (Multi-user management)
// ============================================================================
const utilisateursRouter = router({
  list: utilisateursGererProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
    const usersList = await db.getUsersByArtisanId(artisan.id);
    return usersList.map((u: any) => ({
      id: u.id, name: u.name, prenom: u.prenom, email: u.email,
      role: u.role, actif: u.actif, lastSignedIn: u.lastSignedIn, createdAt: u.createdAt,
    }));
  }),

  invite: utilisateursGererProcedure
    .input(z.object({
      email: z.string().email().max(320),
      // Bornes alignées sur les colonnes `users` (prenom VARCHAR(255)) : évite une
      // entrée surdimensionnée -> ER_DATA_TOO_LONG (500) au lieu d'un 400 propre.
      nom: z.string().min(1).max(255),
      prenom: z.string().max(255).optional(),
      role: z.enum(["artisan", "secretaire", "technicien"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });

      const existing = await db.getUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Cet email est déjà utilisé" });

      // OPE-18 — mot de passe temporaire généré avec un RNG crypto-sûr (10 car. alphanum.)
      const tempPassword = Array.from(randomBytes(10), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
      const passwordHash = await hashPassword(tempPassword);

      const newUser = await db.createCollaborator({
        email: input.email,
        name: input.nom,
        prenom: input.prenom,
        role: input.role,
        artisanId: artisan.id,
        passwordHash,
      });

      // Seed default permissions for the new user's role
      const defaultPerms = ROLE_TEMPLATES[input.role] || ROLE_TEMPLATES.artisan;
      try {
        await db.setUserPermissions(newUser.id, [...defaultPerms], artisan.id);
      } catch (e: any) {
        console.log('[Utilisateurs] Permission seed failed:', e.message);
      }

      const roleFr: Record<string, string> = { artisan: "Artisan", secretaire: "Secrétaire", technicien: "Technicien" };
      try {
        await sendEmail({
          to: input.email,
          subject: `Invitation à rejoindre ${artisan.nomEntreprise || 'Operioz'}`,
          body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;">
            <h2 style="color:#4F46E5;">Bienvenue sur Operioz !</h2>
            <p>Vous avez été invité(e) à rejoindre <strong>${safeHtml(artisan.nomEntreprise || 'l\'entreprise')}</strong> en tant que <strong>${roleFr[input.role] || input.role}</strong>.</p>
            <p>Vos identifiants de connexion :</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:4px 0;"><strong>Email :</strong> ${input.email}</p>
              <p style="margin:4px 0;"><strong>Mot de passe temporaire :</strong> ${tempPassword}</p>
            </div>
            <p>Connectez-vous et changez votre mot de passe dès que possible.</p>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">Operioz - Gestion complète pour artisans du bâtiment</p>
          </body></html>`,
        });
      } catch (e: any) {
        console.log('[Utilisateurs] Email invitation failed:', e.message);
      }

      return { id: newUser.id, email: newUser.email, role: newUser.role };
    }),

  updateRole: utilisateursGererProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["artisan", "secretaire", "technicien"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      const updated = await db.updateUserRole(input.userId, input.role, artisan.id);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Utilisateur non trouvé dans votre entreprise" });
      // Reset permissions to the new role's defaults
      const defaultPerms = ROLE_TEMPLATES[input.role] || ROLE_TEMPLATES.artisan;
      await db.setUserPermissions(input.userId, [...defaultPerms], artisan.id);
      return { id: updated.id, role: updated.role };
    }),

  toggleActif: utilisateursGererProcedure
    .input(z.object({
      userId: z.number(),
      actif: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      const updated = await db.toggleUserActif(input.userId, input.actif, artisan.id);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Utilisateur non trouvé dans votre entreprise" });
      return { id: updated.id, actif: updated.actif };
    }),

  getPermissions: utilisateursGererProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      const targetUser = await db.getUserById(input.userId);
      if (!targetUser || (targetUser.artisanId !== artisan.id && targetUser.id !== artisan.userId))
        throw new TRPCError({ code: "NOT_FOUND", message: "Utilisateur non trouvé" });
      const permissions = await db.getUserPermissions(input.userId);
      const roleDefaults = ROLE_TEMPLATES[targetUser.role] || [];
      return { userId: input.userId, role: targetUser.role, permissions, roleDefaults: [...roleDefaults] };
    }),

  updatePermissions: utilisateursGererProcedure
    .input(z.object({
      userId: z.number(),
      permissions: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      const validPerms = input.permissions.filter(p => (ALL_PERMISSIONS as string[]).includes(p));
      await db.setUserPermissions(input.userId, validPerms, artisan.id);
      return { success: true, count: validPerms.length };
    }),

  resetPermissions: utilisateursGererProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Artisan non trouvé" });
      const targetUser = await db.getUserById(input.userId);
      if (!targetUser || (targetUser.artisanId !== artisan.id && targetUser.id !== artisan.userId))
        throw new TRPCError({ code: "NOT_FOUND", message: "Utilisateur non trouvé" });
      const defaultPerms = ROLE_TEMPLATES[targetUser.role] || ROLE_TEMPLATES.artisan;
      await db.setUserPermissions(input.userId, [...defaultPerms], artisan.id);
      return { success: true, permissions: [...defaultPerms] };
    }),
});

// ============================================================================
// MODULES ROUTER — catalogue + activation par artisan + onboarding
// Implementation 100% raw SQL via db.* helpers, schema.ts intact.
// ============================================================================

const PLAN_ORDER: Record<string, number> = { essentiel: 0, pro: 1, entreprise: 2 };
function isPlanInsuffisant(planModule: string, planArtisan: string | null | undefined): boolean {
  const m = PLAN_ORDER[planModule] ?? 0;
  const a = PLAN_ORDER[planArtisan || "essentiel"] ?? 0;
  return m > a;
}

const modulesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const all = await db.getModules();
    const actifs = await db.getArtisanModulesActifs(artisan.id);
    const status = await db.getArtisanOnboardingStatus(artisan.id);
    const plan = status?.plan || "essentiel";
    return all.map((m) => ({
      id: m.id,
      slug: m.slug,
      label: m.label,
      description: m.description,
      icon: m.icon,
      categorie: m.categorie,
      planMinimum: m.plan_minimum,
      actifParDefaut: m.actif_par_defaut === 1,
      ordre: m.ordre,
      actif: actifs.includes(m.slug),
      locked: isPlanInsuffisant(m.plan_minimum, plan),
    }));
  }),

  getMine: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [] as string[];
    return await db.getArtisanModulesActifs(artisan.id);
  }),

  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return { onboardingCompleted: true, metier: null, plan: null };
    const status = await db.getArtisanOnboardingStatus(artisan.id);
    return status || { onboardingCompleted: true, metier: null, plan: null };
  }),

  toggle: protectedProcedure
    .input(z.object({ slug: z.string(), actif: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });
      const module = await db.getModuleBySlug(input.slug);
      if (!module) throw new TRPCError({ code: "NOT_FOUND", message: "Module inconnu" });
      const status = await db.getArtisanOnboardingStatus(artisan.id);
      const plan = status?.plan || "essentiel";
      if (input.actif && isPlanInsuffisant(module.plan_minimum, plan)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Passez au plan supérieur pour activer ce module",
        });
      }
      await db.setArtisanModule(artisan.id, input.slug, input.actif);
      return { success: true };
    }),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        metier: z.string().optional(),
        plan: z.string().optional(),
        moduleSlugs: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });
      await db.updateArtisanOnboarding(artisan.id, {
        onboardingCompleted: true,
        metier: input.metier,
        plan: input.plan,
      });
      if (input.moduleSlugs) {
        const all = await db.getModules();
        const planArtisan = input.plan || "essentiel";
        for (const m of all) {
          if (isPlanInsuffisant(m.plan_minimum, planArtisan)) continue;
          const wanted = input.moduleSlugs.includes(m.slug);
          await db.setArtisanModule(artisan.id, m.slug, wanted);
        }
      } else {
        await db.initArtisanModules(artisan.id);
      }
      return { success: true };
    }),

  skipOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });
    await db.updateArtisanOnboarding(artisan.id, { onboardingCompleted: true });
    await db.initArtisanModules(artisan.id);
    return { success: true };
  }),
});

// ============================================================================
// IMPORT ROUTER — import multi-ERP clients/devis/factures via CSV
// L'utilisateur upload un CSV cote client, parse en JSON et envoie
// les rows + un mapping {colonneCSV: champOperioz}.
// ============================================================================

function pickField<T extends Record<string, any>>(
  row: T,
  mapping: Record<string, string>,
  field: string
): string | undefined {
  // Cherche la colonne CSV qui mappe vers `field` cote Operioz.
  const csvCol = Object.keys(mapping).find((k) => mapping[k] === field);
  if (!csvCol) return undefined;
  const v = row[csvCol];
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim();
}

const importRouter = router({
  importClients: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.any())).max(5000),
      mapping: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });

      const existingClients = await db.getClientsByArtisanId(artisan.id);
      const seenEmails = new Set(
        existingClients
          .map((c: any) => (c.email || "").toLowerCase().trim())
          .filter((e) => e.length > 0)
      );

      const results = {
        imported: 0,
        errors: 0,
        duplicates: 0,
        errorDetails: [] as string[],
      };

      let lineNum = 1;
      for (const row of input.rows) {
        lineNum++;
        try {
          const nom = pickField(row, input.mapping, "nom");
          if (!nom) {
            results.errors++;
            results.errorDetails.push(`Ligne ${lineNum} : nom manquant`);
            continue;
          }
          const email = pickField(row, input.mapping, "email")?.toLowerCase();
          if (email && seenEmails.has(email)) {
            results.duplicates++;
            continue;
          }
          await db.createClient(artisan.id, {
            nom,
            prenom: pickField(row, input.mapping, "prenom") || undefined,
            email: email || undefined,
            telephone: pickField(row, input.mapping, "telephone") || undefined,
            adresse: pickField(row, input.mapping, "adresse") || undefined,
            codePostal: pickField(row, input.mapping, "codePostal") || undefined,
            ville: pickField(row, input.mapping, "ville") || undefined,
            notes: pickField(row, input.mapping, "notes") || undefined,
          } as any);
          results.imported++;
          if (email) seenEmails.add(email);
        } catch (err: any) {
          results.errors++;
          results.errorDetails.push(`Ligne ${lineNum} : ${err?.message || "erreur"}`);
        }
      }
      return results;
    }),

  importDevis: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.any())).max(5000),
      mapping: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });

      const existingClients = await db.getClientsByArtisanId(artisan.id);
      const findClientByName = (full: string) => {
        const norm = full.toLowerCase().trim();
        return existingClients.find((c: any) => {
          const fn = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase().trim();
          const inv = `${c.nom || ""} ${c.prenom || ""}`.toLowerCase().trim();
          return fn === norm || inv === norm || (c.nom || "").toLowerCase() === norm;
        });
      };

      const results = {
        imported: 0,
        errors: 0,
        duplicates: 0,
        errorDetails: [] as string[],
      };

      let lineNum = 1;
      for (const row of input.rows) {
        lineNum++;
        try {
          const nomClient = pickField(row, input.mapping, "nomClient");
          if (!nomClient) {
            results.errors++;
            results.errorDetails.push(`Ligne ${lineNum} : nomClient manquant`);
            continue;
          }
          const client = findClientByName(nomClient);
          if (!client) {
            results.errors++;
            results.errorDetails.push(`Ligne ${lineNum} : client "${nomClient}" introuvable (importez d'abord les clients)`);
            continue;
          }
          const dateDevisStr = pickField(row, input.mapping, "dateDevis");
          const objet = pickField(row, input.mapping, "objetDevis") || "Devis importé";
          const totalTTC = pickField(row, input.mapping, "totalTTC") || "0";
          const statut = (pickField(row, input.mapping, "statut") || "brouillon") as any;
          const dateDevis = dateDevisStr ? new Date(dateDevisStr) : new Date();
          const dateValidite = new Date(dateDevis.getTime() + 30 * 86400000);

          await db.createDevis(artisan.id, {
            clientId: client.id,
            objet,
            statut,
            dateDevis,
            dateValidite,
            totalTTC,
            notes: pickField(row, input.mapping, "notes") || undefined,
          } as any);
          results.imported++;
        } catch (err: any) {
          results.errors++;
          results.errorDetails.push(`Ligne ${lineNum} : ${err?.message || "erreur"}`);
        }
      }
      return results;
    }),

  importFactures: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.any())).max(5000),
      mapping: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan introuvable" });

      const existingClients = await db.getClientsByArtisanId(artisan.id);
      const findClientByName = (full: string) => {
        const norm = full.toLowerCase().trim();
        return existingClients.find((c: any) => {
          const fn = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase().trim();
          const inv = `${c.nom || ""} ${c.prenom || ""}`.toLowerCase().trim();
          return fn === norm || inv === norm || (c.nom || "").toLowerCase() === norm;
        });
      };

      const results = {
        imported: 0,
        errors: 0,
        duplicates: 0,
        errorDetails: [] as string[],
      };

      let lineNum = 1;
      for (const row of input.rows) {
        lineNum++;
        try {
          const nomClient = pickField(row, input.mapping, "nomClient");
          if (!nomClient) {
            results.errors++;
            results.errorDetails.push(`Ligne ${lineNum} : nomClient manquant`);
            continue;
          }
          const client = findClientByName(nomClient);
          if (!client) {
            results.errors++;
            results.errorDetails.push(`Ligne ${lineNum} : client "${nomClient}" introuvable`);
            continue;
          }
          const dateFactStr = pickField(row, input.mapping, "dateFacture");
          const datePaiementStr = pickField(row, input.mapping, "datePaiement");
          const dateFacture = dateFactStr ? new Date(dateFactStr) : new Date();
          const dateEcheance = new Date(dateFacture.getTime() + 30 * 86400000);

          await db.createFacture(artisan.id, {
            clientId: client.id,
            objet: pickField(row, input.mapping, "objetFacture") || "Facture importée",
            statut: (pickField(row, input.mapping, "statut") || "brouillon") as any,
            dateFacture,
            dateEcheance,
            datePaiement: datePaiementStr ? new Date(datePaiementStr) : undefined,
            modePaiement: pickField(row, input.mapping, "modePaiement") || undefined,
            totalTTC: pickField(row, input.mapping, "totalTTC") || "0",
          } as any);
          results.imported++;
        } catch (err: any) {
          results.errors++;
          results.errorDetails.push(`Ligne ${lineNum} : ${err?.message || "erreur"}`);
        }
      }
      return results;
    }),
});

// ============================================================================
// SEARCH ROUTER — recherche globale Ctrl+K
// Raw SQL en parallele sur 5 entites, max 5 resultats par entite,
// match LIKE %q% sur les colonnes pertinentes.
// ============================================================================

const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (q.length < 2) return { results: [] as Array<{ id: number; type: string; title: string; subtitle: string; url: string }> };

      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return { results: [] };
      const artisanId = artisan.id;
      const like = `%${q}%`;

      // Lazy import du pool pour eviter un cycle avec db.ts.
      const pool = db.getPool();
      if (!pool) return { results: [] };

      // 5 queries en parallele, chacune limitee a 5 lignes max.
      const [
        [clientsRows],
        [devisRows],
        [facturesRows],
        [interventionsRows],
        [fournisseursRows],
      ] = await Promise.all([
        pool.execute(
          // COLLATE utf8mb4_general_ci : recherche insensible aux accents
          // ET a la casse (ex : "evi" trouve "Evrard" ET "Évrard").
          `SELECT id, TRIM(CONCAT(COALESCE(prenom, ''), ' ', nom)) AS title,
                  COALESCE(email, telephone, ville, '') AS subtitle
           FROM clients
           WHERE artisanId = ?
             AND (nom COLLATE utf8mb4_general_ci LIKE ?
                  OR prenom COLLATE utf8mb4_general_ci LIKE ?
                  OR email COLLATE utf8mb4_general_ci LIKE ?
                  OR telephone COLLATE utf8mb4_general_ci LIKE ?
                  OR ville COLLATE utf8mb4_general_ci LIKE ?)
           ORDER BY id DESC
           LIMIT 5`,
          [artisanId, like, like, like, like, like]
        ),
        pool.execute(
          `SELECT id, CONCAT(numero, COALESCE(CONCAT(' — ', objet), '')) AS title,
                  CONCAT(IFNULL(statut, ''), ' — ', FORMAT(COALESCE(totalTTC, 0), 2), ' €') AS subtitle
           FROM devis
           WHERE artisanId = ?
             AND (numero COLLATE utf8mb4_general_ci LIKE ?
                  OR objet COLLATE utf8mb4_general_ci LIKE ?)
           ORDER BY id DESC
           LIMIT 5`,
          [artisanId, like, like]
        ),
        pool.execute(
          `SELECT id, CONCAT(numero, COALESCE(CONCAT(' — ', objet), '')) AS title,
                  CONCAT(IFNULL(statut, ''), ' — ', FORMAT(COALESCE(totalTTC, 0), 2), ' €') AS subtitle
           FROM factures
           WHERE artisanId = ?
             AND (numero COLLATE utf8mb4_general_ci LIKE ?
                  OR objet COLLATE utf8mb4_general_ci LIKE ?)
           ORDER BY id DESC
           LIMIT 5`,
          [artisanId, like, like]
        ),
        pool.execute(
          `SELECT id, titre AS title,
                  CONCAT(IFNULL(statut, ''), ' — ', DATE_FORMAT(dateDebut, '%d/%m/%Y')) AS subtitle
           FROM interventions
           WHERE artisanId = ?
             AND (titre COLLATE utf8mb4_general_ci LIKE ?
                  OR description COLLATE utf8mb4_general_ci LIKE ?)
           ORDER BY dateDebut DESC
           LIMIT 5`,
          [artisanId, like, like]
        ),
        pool.execute(
          `SELECT id, nom AS title,
                  COALESCE(email, telephone, '') AS subtitle
           FROM fournisseurs
           WHERE artisanId = ?
             AND (nom COLLATE utf8mb4_general_ci LIKE ?
                  OR email COLLATE utf8mb4_general_ci LIKE ?)
           ORDER BY id DESC
           LIMIT 3`,
          [artisanId, like, like]
        ),
      ]) as any;

      const toResults = (rows: any[], type: string, basePath: string) =>
        (rows as Array<{ id: number; title: string; subtitle: string }>).map((r) => ({
          id: Number(r.id),
          type,
          title: String(r.title || ''),
          subtitle: String(r.subtitle || ''),
          url: `${basePath}/${r.id}`,
        }));

      return {
        results: [
          ...toResults(clientsRows as any[], 'client', '/clients'),
          ...toResults(devisRows as any[], 'devis', '/devis'),
          ...toResults(facturesRows as any[], 'facture', '/factures'),
          ...toResults(interventionsRows as any[], 'intervention', '/interventions'),
          ...toResults(fournisseursRows as any[], 'fournisseur', '/fournisseurs'),
        ],
      };
    }),
});

// ============================================================================
// SUBSCRIPTION ROUTER (T2) — Stripe Billing
// Plans : Essentiel 29€, Pro 49€, Entreprise 89€. Essai 30j sur tous.
// Stripe Customer/Subscription created on demand au premier checkout.
// ============================================================================
const subscriptionRouter = router({

  // Statut actuel de l'abonnement (lit DB + calcule isTrialing/daysLeft).
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const artisanId = ctx.user.artisanId;
    if (!artisanId) {
      return {
        plan: 'trial', status: 'trialing', isTrialing: true,
        trialDaysLeft: 30, trialEndsAt: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, maxUsers: 1, maxDevicesPerUser: 3,
        maxConcurrentSessions: 2, stripeSubscriptionId: null,
      };
    }
    const sub = await db.getSubscription(artisanId);
    const now = new Date();
    const trialEndsAt = sub?.trialEndsAt || null;
    const isTrialing = sub?.status === 'trialing' && trialEndsAt !== null && trialEndsAt > now;
    const trialDaysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    return {
      plan: sub?.plan || 'trial',
      status: sub?.status || 'trialing',
      isTrialing,
      trialDaysLeft,
      trialEndsAt: sub?.trialEndsAt || null,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd,
      maxUsers: sub?.maxUsers || 1,
      maxDevicesPerUser: sub?.maxDevicesPerUser || 3,
      maxConcurrentSessions: sub?.maxConcurrentSessions || 2,
      stripeSubscriptionId: sub?.stripeSubscriptionId || null,
    };
  }),

  // Cree une session Stripe Checkout pour s'abonner.
  createCheckout: protectedProcedure
    .input(z.object({
      plan: z.enum(['essentiel', 'pro', 'entreprise']),
      interval: z.enum(['month', 'year']),
      extraUsers: z.number().min(0).max(50).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisanId = ctx.user.artisanId;
      if (!artisanId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun artisan associe' });

      const { stripe } = await import('./stripe/stripeService');
      const stripeClient = stripe();

      // Prix Stripe (configurés dans Stripe Dashboard, IDs dans env).
      const PRICES: Record<string, Record<string, string | undefined>> = {
        essentiel: {
          month: process.env.STRIPE_PRICE_ESSENTIEL_MONTH,
          year: process.env.STRIPE_PRICE_ESSENTIEL_YEAR,
        },
        pro: {
          month: process.env.STRIPE_PRICE_PRO_MONTH,
          year: process.env.STRIPE_PRICE_PRO_YEAR,
        },
        entreprise: {
          month: process.env.STRIPE_PRICE_ENTREPRISE_MONTH,
          year: process.env.STRIPE_PRICE_ENTREPRISE_YEAR,
        },
      };
      const EXTRA_USER_PRICES: Record<string, Record<string, string | undefined>> = {
        pro: {
          month: process.env.STRIPE_PRICE_EXTRA_USER_PRO_MONTH,
          year: process.env.STRIPE_PRICE_EXTRA_USER_PRO_YEAR,
        },
        entreprise: {
          month: process.env.STRIPE_PRICE_EXTRA_USER_ENT_MONTH,
          year: process.env.STRIPE_PRICE_EXTRA_USER_ENT_YEAR,
        },
      };

      const mainPriceId = PRICES[input.plan]?.[input.interval];
      if (!mainPriceId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Prix Stripe non configure pour ${input.plan} ${input.interval}. Voir SETUP_STRIPE.md.`,
        });
      }

      const sub = await db.getSubscription(artisanId);
      const artisan = await db.getArtisanByUserId(ctx.user.id);

      // Cree ou recupere le Customer Stripe.
      let customerId = sub?.stripeCustomerId || null;
      if (!customerId) {
        const customer = await stripeClient.customers.create({
          email: ctx.user.email || undefined,
          name: artisan?.nomEntreprise || ctx.user.email || `Artisan ${artisanId}`,
          metadata: { artisanId: String(artisanId) },
        });
        customerId = customer.id;
        await db.updateSubscription(artisanId, { stripeCustomerId: customerId });
      }

      // Build line items.
      const lineItems: any[] = [{ price: mainPriceId, quantity: 1 }];
      if (input.extraUsers > 0 && input.plan !== 'essentiel') {
        const extraPriceId = EXTRA_USER_PRICES[input.plan]?.[input.interval];
        if (extraPriceId) {
          lineItems.push({ price: extraPriceId, quantity: input.extraUsers });
        }
      }

      const appUrl = process.env.APP_URL || 'https://www.operioz.com';

      const session = await stripeClient.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: lineItems,
        subscription_data: {
          trial_period_days: 30,
          metadata: {
            artisanId: String(artisanId),
            plan: input.plan,
            extraUsers: String(input.extraUsers),
          },
        },
        success_url: `${appUrl}/parametres?tab=abonnement&success=1`,
        cancel_url: `${appUrl}/parametres?tab=abonnement&canceled=1`,
        metadata: { artisanId: String(artisanId), plan: input.plan },
      });

      return { url: session.url };
    }),

  // Portail client Stripe (gerer carte, factures, etc.).
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const artisanId = ctx.user.artisanId;
    if (!artisanId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun artisan associe' });

    const sub = await db.getSubscription(artisanId);
    if (!sub?.stripeCustomerId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun abonnement actif trouve' });
    }

    const { stripe } = await import('./stripe/stripeService');
    const stripeClient = stripe();
    const appUrl = process.env.APP_URL || 'https://www.operioz.com';

    const session = await stripeClient.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/parametres?tab=abonnement`,
    });
    return { url: session.url };
  }),

  // Annule a la fin de la periode courante (Stripe convention).
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const artisanId = ctx.user.artisanId;
    if (!artisanId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun artisan associe' });

    const sub = await db.getSubscription(artisanId);
    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun abonnement actif' });
    }

    const { stripe } = await import('./stripe/stripeService');
    await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.updateSubscription(artisanId, { cancelAtPeriodEnd: true });
    return { success: true };
  }),

  // Reactive un abonnement annule (avant la fin de periode).
  reactivate: protectedProcedure.mutation(async ({ ctx }) => {
    const artisanId = ctx.user.artisanId;
    if (!artisanId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun artisan associe' });

    const sub = await db.getSubscription(artisanId);
    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun abonnement trouve' });
    }

    const { stripe } = await import('./stripe/stripeService');
    await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    await db.updateSubscription(artisanId, { cancelAtPeriodEnd: false });
    return { success: true };
  }),
});

// ============================================================================
// DEVICES ROUTER (T3) — gestion des appareils enregistres
// ============================================================================
const devicesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getDevices(ctx.user.id);
  }),

  revoke: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteDevice(input.deviceId, ctx.user.id);
      return { success: true };
    }),

  revokeAll: protectedProcedure.mutation(async ({ ctx }) => {
    // Cote serveur on ne sait pas (proprement) qui est l'appareil courant
    // sans le UA de la requete. On lit l'en-tete user-agent ici.
    const ua = String(ctx.req?.headers?.['user-agent'] || '');
    const { generateFingerprint } = await import('./_core/deviceUtils');
    const currentFp = generateFingerprint(ua);
    const removed = await db.deleteOtherDevices(ctx.user.id, currentFp);
    return { success: true, removed };
  }),
});

// ============================================================================
// SUPPORT ROUTER — formulaire de contact qui envoie un email a support@operioz.com
// ============================================================================
const supportRouter = router({
  contact: protectedProcedure
    .input(z.object({
      nom: z.string().min(1).max(120),
      email: z.string().email(),
      sujet: z.enum(["technique", "facturation", "suggestion", "autre"]),
      message: z.string().min(10).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Anti-flood : borne l'envoi d'emails support depuis un même compte.
      if (!checkSupportContactRate(String(ctx.user.id))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de messages envoyés. Réessayez dans quelques minutes." });
      }
      const subjectLabels: Record<string, string> = {
        technique: "Probleme technique",
        facturation: "Question facturation",
        suggestion: "Suggestion",
        autre: "Autre",
      };
      const subjectLabel = subjectLabels[input.sujet] || input.sujet;
      const body = `<html><body style="font-family:Arial,sans-serif;color:#1f2937;">
        <h2 style="color:#2563eb;">Nouveau message support (${subjectLabel})</h2>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>De :</strong></td><td>${safeHtml(input.nom)} &lt;${safeHtml(input.email)}&gt;</td></tr>
          <tr><td><strong>User ID :</strong></td><td>${ctx.user.id} (artisanId ${ctx.user.artisanId ?? "—"})</td></tr>
          <tr><td><strong>Sujet :</strong></td><td>${subjectLabel}</td></tr>
        </table>
        <div style="background:#f9fafb;border-left:3px solid #2563eb;padding:12px 16px;margin-top:16px;white-space:pre-wrap;">${safeHtml(input.message)}</div>
      </body></html>`;
      await sendEmail({
        to: process.env.SUPPORT_EMAIL || "support@operioz.com",
        subject: `[Support Operioz] ${subjectLabel} — ${input.nom}`,
        body,
      });
      return { success: true };
    }),
});

// ============================================================================
// DEPENSES ROUTER — module Notes de frais Expensya-like
// ============================================================================
const depensesRouter = router({
  // === Liste & CRUD dépenses ===
  list: protectedProcedure
    .input(z.object({
      categorie: z.string().optional(),
      statut: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      userId: z.number().optional(),
      clientId: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getDepensesByArtisan(artisan.id, input || {});
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      return await db.getDepenseById(input.id, artisan.id);
    }),

  create: protectedProcedure
    .input(z.object({
      dateDepense: z.string(),
      // Bornes texte alignées sur les colonnes de `depenses` (defense-in-depth :
      // évite une entrée surdimensionnée -> erreur/troncature MySQL en mode strict).
      // Montants (number) et justificatifUrl (MEDIUMTEXT base64) non touchés.
      fournisseur: z.string().max(255).optional(),
      categorie: z.string().max(50),
      sousCategorie: z.string().max(100).optional(),
      description: z.string().max(2000).optional(),
      montantHt: z.number(),
      tauxTva: z.number().default(20),
      modePaiement: z.string().default("carte"),
      statut: z.string().optional(),
      remboursable: z.boolean().default(true),
      chantierId: z.number().optional(),
      interventionId: z.number().optional(),
      clientId: z.number().optional(),
      notes: z.string().max(5000).optional(),
      justificatifUrl: z.string().optional(),
      justificatifNom: z.string().max(255).optional(),
      tvaDeductible: z.boolean().default(true),
      recurrente: z.boolean().optional(),
      frequenceRecurrence: z.enum(["hebdomadaire", "mensuelle", "trimestrielle", "annuelle"]).optional(),
      prochaineOccurrence: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const numero = await db.getNextDepenseNumero(artisan.id);
      const montantTva = +(input.montantHt * (input.tauxTva / 100)).toFixed(2);
      const montantTtc = +(input.montantHt + montantTva).toFixed(2);
      const dep = await db.createDepense({
        artisanId: artisan.id,
        userId: ctx.user.id,
        numero,
        ...input,
        montantTva,
        montantTtc,
      });
      // Si recurrente, met a jour les champs recurrence apres l'insert
      // (createDepense ne les supporte pas dans sa signature).
      if (dep && input.recurrente && input.frequenceRecurrence) {
        await db.updateDepense(dep.id, artisan.id, {
          recurrente: true,
          frequenceRecurrence: input.frequenceRecurrence,
          prochaineOccurrence: input.prochaineOccurrence || null,
        });
      }
      return dep;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      return await db.updateDepense(input.id, artisan.id, input.data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      await db.deleteDepense(input.id, artisan.id);
      return { success: true };
    }),

  // === Statistiques mois courant ===
  stats: protectedProcedure
    .input(z.object({ mois: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      return await db.getDepensesStats(artisan.id, input?.mois);
    }),

  // === Analyse OCR par Claude vision ===
  analyserJustificatif: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      depenseId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      if (!checkRateLimit(artisan.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });
      }

      // SECURITE (OPE-91) : si depenseId fourni, vérifier qu'elle appartient au tenant
      // AVANT l'OCR (évite un appel Gemini gaspillé + l'écriture cross-tenant de
      // markDepenseOcrTraite, qui ne scopait que par id).
      if (input.depenseId) {
        const dep = await db.getDepenseById(input.depenseId, artisan.id);
        if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Dépense non trouvée" });
      }

      // Detecter le format data URL et extraire le base64 brut.
      const dataMatch = input.imageBase64.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
      const mediaType = (dataMatch?.[1] || "image/jpeg") as any;
      const base64Data = dataMatch ? dataMatch[2] : input.imageBase64;

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: mediaType, data: base64Data } },
            { text: `Analyse cette facture / note de frais. Extrais les informations en JSON :
{"fournisseur":"nom","date":"YYYY-MM-DD","montantHT":0,"tauxTVA":20,"montantTTC":0,"categorie":"materiaux|carburant|outillage|repas|deplacement|telephone|sous-traitance|assurance|loyer|formation|bancaire|autre","description":"description courte","numeroFacture":"numero si visible"}
Reponds UNIQUEMENT avec le JSON, pas de texte autour.` },
          ] }],
          config: { maxOutputTokens: 1000 },
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        if (input.depenseId) {
          await db.markDepenseOcrTraite(input.depenseId, artisan.id, data);
        }
        return { success: true, data };
      } catch (e: any) {
        const msg = String(e?.message || e).replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]").slice(0, 200);
        return { success: false, data: {}, error: `OCR IA echouee : ${msg}` };
      }
    }),

  // === Catégories ===
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getCategoriesDepenses(artisan.id);
  }),

  createCategorie: protectedProcedure
    .input(z.object({
      // Bornes alignées sur `categories_depenses` (nom 100, icone 50, compte 10) +
      // validation du format couleur #RRGGBB (rendue en `style backgroundColor`,
      // defense-in-depth ; behavior-preserving : le sélecteur envoie du #RRGGBB).
      nom: z.string().max(100),
      couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      icone: z.string().max(50).optional(),
      compteComptable: z.string().max(10).optional(),
      plafondMensuel: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      return await db.createCategorieDepense({ ...input, artisanId: artisan.id });
    }),

  updateCategorie: protectedProcedure
    .input(z.object({
      id: z.number(),
      nom: z.string().max(100).optional(),
      couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal("")).optional(),
      icone: z.string().max(50).optional(),
      compteComptable: z.string().max(10).optional(),
      plafondMensuel: z.number().optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await db.updateCategorieDepense(id, artisan.id, data);
      return { success: true };
    }),

  deleteCategorie: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      await db.deleteCategorieDepense(input.id, artisan.id);
      return { success: true };
    }),

  // === Notes de frais ===
  listNotesFrais: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    return await db.getNotesFrais(artisan.id);
  }),

  getNoteFraisById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return null;
      return await db.getNoteFraisById(input.id, artisan.id);
    }),

  createNoteFrais: protectedProcedure
    .input(z.object({
      titre: z.string(),
      periodeDebut: z.string(),
      periodeFin: z.string(),
      depenseIds: z.array(z.number()).max(1000, "Trop de dépenses (max 1000)").optional(), // OPE-24 — anti-DoS
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const numero = await db.getNextNoteFraisNumero(artisan.id);
      const note = await db.createNoteFrais({
        artisanId: artisan.id,
        userId: ctx.user.id,
        numero,
        titre: input.titre,
        periodeDebut: input.periodeDebut,
        periodeFin: input.periodeFin,
      });
      if (note && input.depenseIds?.length) {
        for (const did of input.depenseIds) {
          await db.addDepenseToNoteFrais(note.id, did, artisan.id);
        }
        await db.calculerTotalNoteFrais(note.id, artisan.id);
      }
      return note;
    }),

  addDepenseToNoteFrais: protectedProcedure
    .input(z.object({ noteId: z.number(), depenseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      await db.addDepenseToNoteFrais(input.noteId, input.depenseId, artisan.id);
      await db.calculerTotalNoteFrais(input.noteId, artisan.id);
      return { success: true };
    }),

  removeDepenseFromNoteFrais: protectedProcedure
    .input(z.object({ noteId: z.number(), depenseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      await db.removeDepenseFromNoteFrais(input.noteId, input.depenseId);
      await db.calculerTotalNoteFrais(input.noteId, artisan.id);
      return { success: true };
    }),

  soumettreNoteFrais: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      return await db.soumettreNoteFrais(input.id, artisan.id);
    }),

  approuverNoteFrais: protectedProcedure
    .input(z.object({ id: z.number(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      return await db.approuverNoteFrais(input.id, artisan.id, input.commentaire);
    }),

  rejeterNoteFrais: protectedProcedure
    .input(z.object({ id: z.number(), commentaire: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      return await db.rejeterNoteFrais(input.id, artisan.id, input.commentaire);
    }),

  payerNoteFrais: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      return await db.payerNoteFrais(input.id, artisan.id);
    }),

  // === Budgets ===
  getBudgets: protectedProcedure
    // mois = colonne VARCHAR(7), le front envoie toujours "YYYY-MM" (toISOString().slice(0,7)).
    // La regex est behavior-preserving et évite un ER_DATA_TOO_LONG / une valeur incohérente (OPE-24).
    .input(z.object({ mois: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)") }))
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.calculerBudgetsRealises(artisan.id, input.mois);
    }),

  setBudget: protectedProcedure
    .input(z.object({
      categorie: z.string().max(100),
      mois: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
      budget: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      await db.upsertBudget(artisan.id, input.categorie, input.mois, input.budget);
      return { success: true };
    }),

  copierBudgetsMois: protectedProcedure
    .input(z.object({
      moisSource: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
      moisCible: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const pool = (db as any).getPool();
      if (pool) {
        await pool.execute(
          `INSERT INTO budgets_categories (artisan_id, categorie, mois, budget)
           SELECT artisan_id, categorie, ?, budget
             FROM budgets_categories
            WHERE artisan_id = ? AND mois = ?
           ON DUPLICATE KEY UPDATE budget = VALUES(budget)`,
          [input.moisCible, artisan.id, input.moisSource]
        );
      }
      return { success: true };
    }),

  // === Import relevé bancaire ===
  importReleve: protectedProcedure
    .input(z.object({
      nomFichier: z.string().max(255),
      contenuCsv: z.string().max(5_000_000, "Fichier trop volumineux (max ~5 Mo)"),
    }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      // Parser CSV simple : ligne 1 = header, separateur ; ou , detecte auto.
      const lignes = input.contenuCsv.split(/\r?\n/).filter((l) => l.trim());
      if (lignes.length < 2) {
        return { releveId: 0, nbImportees: 0, message: "CSV vide ou invalide" };
      }
      // Borne le nombre de lignes parsées/insérées (anti-DoS) — erreur claire plutôt
      // que troncature silencieuse. Un relevé bancaire légitime reste très en deçà.
      if (lignes.length - 1 > 5000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Relevé trop volumineux (max 5000 lignes par import)" });
      }
      const sep = (lignes[0].match(/;/g)?.length || 0) > (lignes[0].match(/,/g)?.length || 0) ? ";" : ",";
      const transactions: any[] = [];
      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 3) continue;
        // Heuristique : date = col 0, libelle = col 1, montant = col 2 ou 2+3 (debit/credit)
        const dateRaw = cols[0];
        const libelle = cols[1] || "";
        // Date au format DD/MM/YYYY -> YYYY-MM-DD
        let dateIso = dateRaw;
        const fr = dateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (fr) dateIso = `${fr[3]}-${fr[2]}-${fr[1]}`;
        // Montant : col 2 si present, sinon col 3-col 2 (debit/credit cols)
        let montant = parseFloat((cols[2] || "0").replace(",", ".").replace(/\s/g, ""));
        if (isNaN(montant) || montant === 0) {
          const debit = parseFloat((cols[2] || "0").replace(",", ".").replace(/\s/g, ""));
          const credit = parseFloat((cols[3] || "0").replace(",", ".").replace(/\s/g, ""));
          montant = !isNaN(credit) && credit > 0 ? credit : -Math.abs(debit || 0);
        }
        if (!dateIso || isNaN(montant) || !libelle) continue;
        transactions.push({
          dateTransaction: dateIso,
          libelle,
          montant,
          typeTransaction: montant < 0 ? "debit" : "credit",
        });
      }
      return await db.importReleve(artisan.id, input.nomFichier, transactions);
    }),

  getTransactionsBancaires: protectedProcedure
    .input(z.object({ releveId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) return [];
      return await db.getTransactionsBancaires(artisan.id, input?.releveId);
    }),

  // Convertir une transaction bancaire en depense
  convertirTransaction: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      categorie: z.string(),
      fournisseur: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      // Lire la transaction.
      const trxs = await db.getTransactionsBancaires(artisan.id);
      const t = trxs.find((x: any) => x.id === input.transactionId);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      // Garde d'idempotence : une transaction déjà liée à une dépense (depense_id)
      // ne doit pas être re-convertie (double-clic / re-visite) -> évite des dépenses
      // dupliquées dans les livres (impact FEC/TVA).
      if (t.depense_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction déjà convertie en dépense" });
      }
      const numero = await db.getNextDepenseNumero(artisan.id);
      const montantTtc = Number(t.montant || 0);
      const tauxTva = 20;
      const montantHt = +(montantTtc / (1 + tauxTva / 100)).toFixed(2);
      const montantTva = +(montantTtc - montantHt).toFixed(2);
      const dep = await db.createDepense({
        artisanId: artisan.id,
        userId: ctx.user.id,
        numero,
        dateDepense: String(t.date_transaction).slice(0, 10),
        fournisseur: input.fournisseur || String(t.libelle || "").slice(0, 200),
        categorie: input.categorie,
        description: input.description || String(t.libelle || "").slice(0, 200),
        montantHt,
        tauxTva,
        montantTva,
        montantTtc,
        modePaiement: "carte",
        statut: "brouillon",
      });
      if (dep) await db.lierTransactionDepense(input.transactionId, dep.id, artisan.id);
      return dep;
    }),

  ignorerTransaction: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      await db.ignorerTransaction(input.id, artisan.id);
      return { success: true };
    }),

  // === Export FEC achats ===
  exportFecAchats: protectedProcedure
    .input(z.object({ dateDebut: z.string(), dateFin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const contenu = await db.exportDepensesFEC(artisan.id, input.dateDebut, input.dateFin);
      return { contenu };
    }),

  // === Indemnités kilométriques (T10B) ===
  creerIndemniteKm: protectedProcedure
    .input(z.object({
      dateDepense: z.string(),
      kilometres: z.number(),
      tarifKm: z.number().default(0.529),
      motif: z.string().optional(),
      chantierId: z.number().optional(),
      clientId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const numero = await db.getNextDepenseNumero(artisan.id);
      // Indemnites km : sans TVA recuperable (regime fiscal forfait).
      const montant = +(input.kilometres * input.tarifKm).toFixed(2);
      return await db.createDepense({
        artisanId: artisan.id,
        userId: ctx.user.id,
        numero,
        dateDepense: input.dateDepense,
        fournisseur: "Indemnités kilométriques",
        categorie: "Déplacement & Transport",
        description: `${input.kilometres} km${input.motif ? ` — ${input.motif}` : ""} @ ${input.tarifKm} EUR/km`,
        montantHt: montant,
        tauxTva: 0,
        montantTva: 0,
        montantTtc: montant,
        modePaiement: "carte",
        tvaDeductible: false,
        remboursable: true,
        chantierId: input.chantierId,
        clientId: input.clientId,
      });
    }),

  // === Règles de catégorisation auto (T10C) ===
  getRegles: protectedProcedure.query(async ({ ctx }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) return [];
    const pool = (db as any).getPool();
    if (!pool) return [];
    const [rows]: any = await pool.execute(
      `SELECT * FROM regles_categorisation WHERE artisan_id = ? AND actif = TRUE ORDER BY id DESC`,
      [artisan.id]
    );
    return rows as any[];
  }),

  createRegle: protectedProcedure
    .input(z.object({ motifLibelle: z.string(), categorie: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let artisan = await db.getOrCreateArtisan(ctx.user.id);
      const pool = (db as any).getPool();
      if (pool) {
        await pool.execute(
          `INSERT INTO regles_categorisation (artisan_id, motif_libelle, categorie) VALUES (?, ?, ?)`,
          [artisan.id, input.motifLibelle, input.categorie]
        );
      }
      return { success: true };
    }),

  deleteRegle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const artisan = await db.getArtisanByUserId(ctx.user.id);
      if (!artisan) throw new TRPCError({ code: "FORBIDDEN" });
      const pool = (db as any).getPool();
      if (pool) {
        await pool.execute(
          `UPDATE regles_categorisation SET actif = FALSE WHERE id = ? AND artisan_id = ?`,
          [input.id, artisan.id]
        );
      }
      return { success: true };
    }),
});

export const appRouter = router({system: systemRouter,
  depenses: depensesRouter,
  search: searchRouter,
  subscription: subscriptionRouter,
  devices: devicesRouter,
  support: supportRouter,
  modules: modulesRouter,
  importErp: importRouter,
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

          // OPE-7 : provisionner le compte (artisan + subscription d'essai +
          // permissions proprietaire). Sans ca, l'app est inutilisable apres
          // inscription (FORBIDDEN/NOT_FOUND partout, checkout impossible).
          await db.bootstrapArtisanAccount(user.id);

          const token = await createToken({ id: user.id, email: user.email });
          setAuthCookie(ctx.res, token, ctx.req);

          // Email de bienvenue (best-effort, n'echoue pas si Resend indispo).
          try {
            await sendEmail({
              to: input.email,
              subject: "Bienvenue sur Operioz ! 🎉",
              body: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Bienvenue sur Operioz ! 🎉</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour${input.name ? ` ${safeHtml(input.name)}` : ""},</p>
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
            Votre compte Operioz a été créé avec succès. Vous bénéficiez de 14 jours d'essai gratuit sur toutes les fonctionnalités.
          </p>
          <p style="margin:0 0 12px 0;font-size:15px;color:#374151;line-height:1.6;"><strong>Pour bien démarrer :</strong></p>
          <ol style="margin:0 0 24px 20px;padding:0;font-size:15px;color:#374151;line-height:1.8;">
            <li>Complétez votre profil et ajoutez votre logo</li>
            <li>Importez vos clients depuis votre ancien logiciel</li>
            <li>Créez votre premier devis avec MonAssistant IA</li>
          </ol>
          <p style="margin:24px 0;text-align:center;">
            <a href="${process.env.APP_URL || 'https://www.operioz.com'}/dashboard" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
              Accéder à mon espace →
            </a>
          </p>
          <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            En cas de question, répondez simplement à cet email — notre équipe est là pour vous aider.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz. Le logiciel de gestion tout-en-un pour les professionnels.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
            });
          } catch (mailErr) {
            console.error("[Signup] Welcome email failed (non-blocking):", mailErr);
          }

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
        // OPE-7 : auto-reparation des comptes crees avant le fix (artisan /
        // subscription / permissions manquants). Idempotent et best-effort :
        // ne seed que ce qui manque, ne bloque jamais le login.
        // IMPORTANT : on ne provisionne QUE les proprietaires. Un collaborateur
        // (secretaire/technicien) a toujours users.artisanId renseigne vers
        // l'entreprise du proprietaire ; bootstrapper lui creerait a tort sa
        // propre entreprise + toutes les permissions. Donc on ne declenche que
        // si artisanId est null (= proprietaire dont le signup a echoue).
        try {
          const dbUser = await db.getUserById(user.id);
          if (dbUser && !dbUser.artisanId) {
            await db.bootstrapArtisanAccount(user.id);
          }
        } catch (e: any) {
          console.error('[Signin] bootstrap self-heal failed (non-blocking):', e?.message);
        }
        const token = await createToken({ id: user.id, email: user.email });
        setAuthCookie(ctx.res, token, ctx.req);
        return { success: true, user };
      }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      clearAuthCookie(ctx.res);
      return { success: true };
    }),

    /** Modifier l'adresse email de l'utilisateur courant. */
    updateEmail: protectedProcedure
      .input(z.object({ newEmail: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getUserByEmail(input.newEmail);
        if (existing && existing.id !== ctx.user.id) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email déjà utilisé' });
        }
        await db.updateUser(ctx.user.id, { email: input.newEmail });
        return { success: true };
      }),

    /** Modifier le mot de passe : verifie l'ancien puis hash le nouveau. */
    updatePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.password) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun mot de passe configuré sur ce compte' });
        }
        const { verifyPassword, hashPassword } = await import('./_core/auth');
        const ok = await verifyPassword(input.currentPassword, user.password);
        if (!ok) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Mot de passe actuel incorrect' });
        }
        const hashed = await hashPassword(input.newPassword);
        await db.updateUser(ctx.user.id, { password: hashed });
        return { success: true };
      }),

    /**
     * OPE-8 — Demande de reinitialisation du mot de passe.
     * Genere un token aleatoire (envoye par email), stocke uniquement son
     * hash SHA-256 + expiry 1h. Reponse TOUJOURS identique (success) pour ne
     * pas reveler si l'email existe (anti-enumeration).
     */
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        // Anti-flood par adresse (réponse constante préservée : on retourne le même
        // success sans envoyer au-delà du seuil). Ne révèle pas l'existence du compte.
        if (!checkPasswordResetRate(input.email.toLowerCase().trim())) {
          return { success: true };
        }
        const user = await db.getUserByEmail(input.email);
        // On ne traite que les comptes actifs disposant d'un mot de passe
        // (les comptes OAuth-only n'ont pas de password a reinitialiser).
        if (user && user.actif !== false && user.password) {
          const rawToken = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(rawToken).digest('hex');
          const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
          await db.updateUser(user.id, {
            resetToken: tokenHash,
            resetTokenExpiry: expiry,
          } as any);

          // OPE-76 — l'URL de réinitialisation DOIT provenir d'une source de confiance
          // (APP_URL), jamais du header `Origin` (contrôlable par l'attaquant) : sinon
          // un reset déclenché pour la victime avec `Origin: attaquant.tld` lui envoie un
          // lien pointant vers le domaine de l'attaquant AVEC un token valide → vol de
          // token / prise de contrôle du compte. Pour une requête légitime, Origin ==
          // APP_URL, donc le lien est identique (comportement préservé).
          const baseUrl = process.env.APP_URL || 'https://www.operioz.com';
          const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
          try {
            await sendEmail({
              to: input.email,
              subject: 'Réinitialisation de votre mot de passe Operioz',
              body: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#2563eb;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Réinitialisation du mot de passe</h1>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">Bonjour,</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
            Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien est valable <strong>1 heure</strong>.
          </p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${resetUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
              Réinitialiser mon mot de passe →
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
            Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe restera inchangé.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
            });
          } catch (mailErr) {
            console.error('[ForgotPassword] Email failed (non-blocking):', mailErr);
          }
        }
        // Reponse constante : ne jamais reveler l'existence de l'email.
        return { success: true };
      }),

    /**
     * OPE-8 — Applique le nouveau mot de passe a partir d'un token valide.
     * Hash le token recu, cherche un user dont le hash correspond et dont
     * l'expiry est dans le futur, met a jour le password et invalide le token.
     */
    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        newPassword: z.string().min(6, 'Le mot de passe doit faire au moins 6 caractères'),
      }))
      .mutation(async ({ input }) => {
        const tokenHash = createHash('sha256').update(input.token).digest('hex');
        const user = await db.getUserByValidResetToken(tokenHash);
        if (!user) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lien invalide ou expiré. Veuillez refaire une demande.' });
        }
        const hashed = await hashPassword(input.newPassword);
        await db.updateUser(user.id, {
          password: hashed,
          resetToken: null,
          resetTokenExpiry: null,
        } as any);
        return { success: true };
      }),

    /** Suppression du compte (soft delete : actif=false). Deconnecte ensuite. */
    deleteAccount: protectedProcedure
      .input(z.object({ confirmation: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (input.confirmation !== 'SUPPRIMER') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Confirmation incorrecte' });
        }
        // Soft-delete : marque inactif + invalide l'email pour autoriser
        // sa reutilisation. Conserve les donnees liees (devis/factures)
        // pour conformite legale (l'artisan peut avoir besoin de les
        // recuperer pour la comptabilite).
        await db.updateUser(ctx.user.id, {
          actif: false,
          email: `deleted_${ctx.user.id}_${Date.now()}@operioz.com`,
        } as any);
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
  statistiques: statistiquesRouter,
  rdv: rdvRouter,
  relances: relancesRouter,
  portail: portailRouter,
  calendrier: calendrierRouter,
  assistant: assistantRouter,
  vitrine: vitrineRouter,
  utilisateurs: utilisateursRouter,
});

export type AppRouter = typeof appRouter;
