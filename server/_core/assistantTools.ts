import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import * as db from "../db";
import {
  sendEmail,
  generateDevisEmailContent,
  generateFactureEmailContent,
  generateRappelFactureContent,
} from "./emailService";

// ============================================================================
// Tool definitions exposées à Claude (function calling)
// ============================================================================

export const AGENT_TOOLS: Tool[] = [
  {
    name: "chercher_client",
    description:
      "Recherche un client par nom ou prénom pour obtenir son ID. Insensible à la casse, retourne jusqu'à 5 résultats. À utiliser AVANT toute action liée à un client si tu n'as pas son ID.",
    input_schema: {
      type: "object",
      properties: {
        nom: {
          type: "string",
          description: "Texte à chercher dans le nom, prénom ou entreprise du client.",
        },
      },
      required: ["nom"],
    },
  },
  {
    name: "creer_devis",
    description:
      "Crée un nouveau devis en brouillon pour un client avec ses lignes. Retourne le numéro et l'ID du devis créé. Calcule automatiquement les totaux HT/TVA/TTC.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "number", description: "ID du client (obtenu via chercher_client)" },
        objet: { type: "string", description: "Objet/titre du devis" },
        lignes: {
          type: "array",
          description: "Lignes du devis avec leurs montants",
          items: {
            type: "object",
            properties: {
              designation: { type: "string" },
              quantite: { type: "number" },
              unite: { type: "string", description: "Ex: u, h, m, m², forfait" },
              prixUnitaireHT: { type: "number" },
              tauxTVA: { type: "number", description: "En pourcentage, ex: 20" },
            },
            required: ["designation", "quantite", "prixUnitaireHT"],
          },
        },
        notes: { type: "string", description: "Notes ou conditions particulières (optionnel)" },
        validiteDays: {
          type: "number",
          description: "Nombre de jours de validité du devis (défaut: 30)",
        },
      },
      required: ["clientId", "objet", "lignes"],
    },
  },
  {
    name: "envoyer_devis",
    description:
      "Envoie un devis existant par email au client. Le PDF est généré et joint automatiquement. Le statut du devis passe à 'envoye'.",
    input_schema: {
      type: "object",
      properties: {
        devisId: { type: "number" },
        messagePersonnalise: {
          type: "string",
          description: "Message libre ajouté au corps de l'email (optionnel)",
        },
      },
      required: ["devisId"],
    },
  },
  {
    name: "creer_et_envoyer_devis",
    description:
      "Crée un devis ET l'envoie immédiatement par email au client. Combine creer_devis et envoyer_devis en une seule action.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "number" },
        objet: { type: "string" },
        lignes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              designation: { type: "string" },
              quantite: { type: "number" },
              unite: { type: "string" },
              prixUnitaireHT: { type: "number" },
              tauxTVA: { type: "number" },
            },
            required: ["designation", "quantite", "prixUnitaireHT"],
          },
        },
        messageEmail: { type: "string", description: "Message personnalisé pour l'email (optionnel)" },
      },
      required: ["clientId", "objet", "lignes"],
    },
  },
  {
    name: "creer_facture",
    description:
      "Crée une facture pour un client. Si devisId est fourni, la facture est créée à partir du devis (recopie clientId, lignes, totaux). Sinon, crée la facture avec les lignes fournies.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "number", description: "Requis si pas de devisId" },
        devisId: { type: "number", description: "ID du devis source (optionnel)" },
        objet: { type: "string" },
        lignes: {
          type: "array",
          description: "Requis si pas de devisId",
          items: {
            type: "object",
            properties: {
              designation: { type: "string" },
              quantite: { type: "number" },
              unite: { type: "string" },
              prixUnitaireHT: { type: "number" },
              tauxTVA: { type: "number" },
            },
            required: ["designation", "quantite", "prixUnitaireHT"],
          },
        },
      },
      required: ["objet"],
    },
  },
  {
    name: "envoyer_facture",
    description: "Envoie une facture par email au client avec son PDF en pièce jointe.",
    input_schema: {
      type: "object",
      properties: {
        factureId: { type: "number" },
        messagePersonnalise: { type: "string" },
      },
      required: ["factureId"],
    },
  },
  {
    name: "envoyer_relance",
    description:
      "Envoie une relance pour une facture impayée. Utilise un message de rappel adapté avec le nombre de jours de retard.",
    input_schema: {
      type: "object",
      properties: {
        factureId: { type: "number" },
        messagePersonnalise: { type: "string" },
      },
      required: ["factureId"],
    },
  },
  {
    name: "creer_intervention",
    description:
      "Planifie une intervention dans le calendrier. Les dates doivent être au format ISO 8601 (ex: 2026-05-13T08:00:00).",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "number" },
        titre: { type: "string" },
        description: { type: "string" },
        dateDebut: { type: "string", description: "Date/heure ISO 8601" },
        dateFin: { type: "string", description: "Date/heure ISO 8601" },
        adresse: { type: "string" },
      },
      required: ["clientId", "titre", "dateDebut", "dateFin"],
    },
  },
  {
    name: "lister_factures_impayees",
    description:
      "Liste toutes les factures non payées (statut envoyée ou en retard). Retourne id, numéro, client, montantTTC, date échéance, jours de retard.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "lister_devis_en_attente",
    description:
      "Liste les devis envoyés en attente de réponse du client (statut envoye). Retourne id, numéro, client, montantTTC, date du devis.",
    input_schema: { type: "object", properties: {} },
  },
];

// ============================================================================
// Tool executors
// ============================================================================

export interface ToolContext {
  artisanId: number;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}
function fail(error: string): ToolResult {
  return { ok: false, error };
}

async function execChercherClient(input: any, ctx: ToolContext): Promise<ToolResult> {
  const query = String(input?.nom || "").toLowerCase().trim();
  if (!query) return fail("Le paramètre 'nom' est requis");
  const clients = await db.getClientsByArtisanId(ctx.artisanId);
  const matches = clients
    .filter((c: any) => {
      const full = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase();
      const entreprise = (c.entreprise || "").toLowerCase();
      return full.includes(query) || entreprise.includes(query);
    })
    .slice(0, 5)
    .map((c: any) => ({
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      entreprise: c.entreprise || null,
      email: c.email || null,
      telephone: c.telephone || null,
      ville: c.ville || null,
    }));
  return ok({ matches, count: matches.length });
}

async function assertClientBelongs(clientId: number, ctx: ToolContext): Promise<any> {
  const client = await db.getClientById(clientId);
  if (!client) throw new Error("Client introuvable");
  if (client.artisanId !== ctx.artisanId) throw new Error("Ce client n'appartient pas à votre compte");
  return client;
}

async function createDevisWithLignes(
  ctx: ToolContext,
  args: {
    clientId: number;
    objet: string;
    lignes: Array<{ designation: string; quantite: number; unite?: string; prixUnitaireHT: number; tauxTVA?: number }>;
    notes?: string;
    validiteDays?: number;
  }
) {
  await assertClientBelongs(args.clientId, ctx);

  const validity = args.validiteDays ?? 30;
  const dateDevis = new Date();
  const dateValidite = new Date(dateDevis.getTime() + validity * 86400000);

  const devisRecord = await db.createDevis(ctx.artisanId, {
    clientId: args.clientId,
    objet: args.objet,
    notes: args.notes || undefined,
    statut: "brouillon",
    dateDevis,
    dateValidite,
  } as any);

  for (let i = 0; i < args.lignes.length; i++) {
    const l = args.lignes[i];
    const quantite = Number(l.quantite) || 0;
    const prix = Number(l.prixUnitaireHT) || 0;
    const tva = Number(l.tauxTVA ?? 20);
    const montantHT = quantite * prix;
    const montantTVA = (montantHT * tva) / 100;
    const montantTTC = montantHT + montantTVA;
    await db.createLigneDevis({
      devisId: devisRecord.id,
      ordre: i + 1,
      designation: l.designation,
      quantite: String(quantite),
      unite: l.unite || "u",
      prixUnitaireHT: String(prix),
      tauxTVA: String(tva),
      montantHT: montantHT.toFixed(2),
      montantTVA: montantTVA.toFixed(2),
      montantTTC: montantTTC.toFixed(2),
    } as any);
  }

  const updated = await db.recalculateDevisTotals(devisRecord.id);
  return updated || devisRecord;
}

async function execCreerDevis(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.clientId || !input?.objet || !Array.isArray(input?.lignes) || input.lignes.length === 0) {
    return fail("Paramètres manquants : clientId, objet et au moins une ligne sont requis");
  }
  try {
    const devisRecord = await createDevisWithLignes(ctx, input);
    return ok({
      devisId: devisRecord.id,
      numero: devisRecord.numero,
      totalTTC: devisRecord.totalTTC,
      statut: devisRecord.statut,
      message: `Devis ${devisRecord.numero} créé en brouillon (${parseFloat(devisRecord.totalTTC || "0").toFixed(2)} € TTC)`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création du devis");
  }
}

async function sendDevisEmailHelper(devisId: number, customMessage: string | undefined, ctx: ToolContext) {
  const devisData = await db.getDevisById(devisId);
  if (!devisData) throw new Error("Devis introuvable");
  if (devisData.artisanId !== ctx.artisanId) throw new Error("Ce devis n'appartient pas à votre compte");

  const artisan = await db.getArtisanById(ctx.artisanId);
  if (!artisan) throw new Error("Profil artisan introuvable");

  const client = await db.getClientById(devisData.clientId);
  if (!client) throw new Error("Client introuvable");
  if (!client.email) throw new Error("Le client n'a pas d'adresse email");

  const lignes = await db.getLignesDevisByDevisId(devisData.id);
  const { generateDevisPDF } = await import("./pdfGenerator");
  const pdfBuffer = generateDevisPDF({ devis: { ...devisData, lignes }, artisan: artisan as any, client });

  const totalTTC = `${parseFloat(devisData.totalTTC || "0").toFixed(2)} €`;
  const { subject, body } = generateDevisEmailContent({
    artisanName: artisan.nomEntreprise || "Votre artisan",
    clientName: `${client.prenom || ""} ${client.nom}`.trim(),
    devisNumero: devisData.numero,
    devisObjet: devisData.objet || undefined,
    totalTTC,
    dateValidite: devisData.dateValidite
      ? new Date(devisData.dateValidite).toLocaleDateString("fr-FR")
      : undefined,
  });

  const finalBody = customMessage
    ? body.replace(
        "</body>",
        `<div style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;margin:0 40px;padding-top:16px;">${customMessage.replace(/\n/g, "<br>")}</div></body>`
      )
    : body;

  const result = await sendEmail({
    to: client.email,
    subject,
    body: finalBody,
    attachmentName: `Devis_${devisData.numero}.pdf`,
    attachmentContent: pdfBuffer.toString("base64"),
  });

  if (result.success) {
    await db.updateDevis(devisData.id, { statut: "envoye" });
    await db.createNotification({
      artisanId: ctx.artisanId,
      type: "succes",
      titre: "Devis envoyé",
      message: `Le devis ${devisData.numero} a été envoyé à ${client.email}`,
      lien: `/devis/${devisData.id}`,
    });
  }

  return { ...result, numero: devisData.numero, to: client.email };
}

async function execEnvoyerDevis(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.devisId) return fail("devisId est requis");
  try {
    const result = await sendDevisEmailHelper(Number(input.devisId), input.messagePersonnalise, ctx);
    if (!result.success) return fail(result.message);
    return ok({ numero: result.numero, to: result.to, message: `Devis ${result.numero} envoyé à ${result.to}` });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de l'envoi du devis");
  }
}

async function execCreerEtEnvoyerDevis(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.clientId || !input?.objet || !Array.isArray(input?.lignes) || input.lignes.length === 0) {
    return fail("Paramètres manquants : clientId, objet et au moins une ligne sont requis");
  }
  try {
    const devisRecord = await createDevisWithLignes(ctx, input);
    const sendResult = await sendDevisEmailHelper(devisRecord.id, input.messageEmail, ctx);
    if (!sendResult.success) {
      return fail(`Devis ${devisRecord.numero} créé mais email non envoyé : ${sendResult.message}`);
    }
    return ok({
      devisId: devisRecord.id,
      numero: devisRecord.numero,
      to: sendResult.to,
      totalTTC: devisRecord.totalTTC,
      message: `Devis ${devisRecord.numero} (${parseFloat(devisRecord.totalTTC || "0").toFixed(2)} €) créé et envoyé à ${sendResult.to}`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création/envoi du devis");
  }
}

async function execCreerFacture(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.objet) return fail("objet est requis");
  try {
    let factureRecord: any;

    if (input.devisId) {
      const devisData = await db.getDevisById(Number(input.devisId));
      if (!devisData) return fail("Devis introuvable");
      if (devisData.artisanId !== ctx.artisanId) return fail("Ce devis n'appartient pas à votre compte");
      factureRecord = await db.createFactureFromDevis(Number(input.devisId));
      if (input.objet && input.objet !== factureRecord.objet) {
        await db.updateFacture(factureRecord.id, { objet: input.objet });
        factureRecord = await db.getFactureById(factureRecord.id);
      }
    } else {
      if (!input.clientId) return fail("clientId ou devisId requis");
      if (!Array.isArray(input.lignes) || input.lignes.length === 0) {
        return fail("Au moins une ligne est requise quand devisId n'est pas fourni");
      }
      await assertClientBelongs(Number(input.clientId), ctx);

      const dateFacture = new Date();
      const dateEcheance = new Date(dateFacture.getTime() + 30 * 86400000);

      factureRecord = await db.createFacture(ctx.artisanId, {
        clientId: Number(input.clientId),
        objet: input.objet,
        statut: "brouillon",
        dateFacture,
        dateEcheance,
      } as any);

      for (let i = 0; i < input.lignes.length; i++) {
        const l = input.lignes[i];
        const quantite = Number(l.quantite) || 0;
        const prix = Number(l.prixUnitaireHT) || 0;
        const tva = Number(l.tauxTVA ?? 20);
        const montantHT = quantite * prix;
        const montantTVA = (montantHT * tva) / 100;
        const montantTTC = montantHT + montantTVA;
        await db.createLigneFacture({
          factureId: factureRecord.id,
          ordre: i + 1,
          designation: l.designation,
          quantite: String(quantite),
          unite: l.unite || "u",
          prixUnitaireHT: String(prix),
          tauxTVA: String(tva),
          montantHT: montantHT.toFixed(2),
          montantTVA: montantTVA.toFixed(2),
          montantTTC: montantTTC.toFixed(2),
        } as any);
      }
      const updated = await db.recalculateFactureTotals(factureRecord.id);
      factureRecord = updated || factureRecord;
    }

    return ok({
      factureId: factureRecord.id,
      numero: factureRecord.numero,
      totalTTC: factureRecord.totalTTC,
      statut: factureRecord.statut,
      message: `Facture ${factureRecord.numero} créée (${parseFloat(factureRecord.totalTTC || "0").toFixed(2)} € TTC)`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création de la facture");
  }
}

async function sendFactureEmailHelper(factureId: number, customMessage: string | undefined, ctx: ToolContext) {
  const factureData = await db.getFactureById(factureId);
  if (!factureData) throw new Error("Facture introuvable");
  if (factureData.artisanId !== ctx.artisanId) throw new Error("Cette facture n'appartient pas à votre compte");

  const artisan = await db.getArtisanById(ctx.artisanId);
  if (!artisan) throw new Error("Profil artisan introuvable");

  const client = await db.getClientById(factureData.clientId);
  if (!client) throw new Error("Client introuvable");
  if (!client.email) throw new Error("Le client n'a pas d'adresse email");

  const lignes = await db.getLignesFacturesByFactureId(factureData.id);
  const { generateFacturePDF } = await import("./pdfGenerator");
  const pdfBuffer = generateFacturePDF({ facture: { ...factureData, lignes }, artisan: artisan as any, client });

  const { subject, body } = generateFactureEmailContent({
    artisanName: artisan.nomEntreprise || "Votre artisan",
    clientName: `${client.prenom || ""} ${client.nom}`.trim(),
    factureNumero: factureData.numero,
    factureObjet: factureData.objet || undefined,
    totalTTC: `${parseFloat(factureData.totalTTC || "0").toFixed(2)} €`,
    dateEcheance: factureData.dateEcheance
      ? new Date(factureData.dateEcheance).toLocaleDateString("fr-FR")
      : undefined,
  });

  const finalBody = customMessage
    ? body.replace(
        "</body>",
        `<div style="padding:0 40px 24px 40px;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;margin:0 40px;padding-top:16px;">${customMessage.replace(/\n/g, "<br>")}</div></body>`
      )
    : body;

  const result = await sendEmail({
    to: client.email,
    subject,
    body: finalBody,
    attachmentName: `Facture_${factureData.numero}.pdf`,
    attachmentContent: pdfBuffer.toString("base64"),
  });

  if (result.success) {
    if (factureData.statut === "brouillon") {
      await db.updateFacture(factureData.id, { statut: "envoyee" });
    }
    await db.createNotification({
      artisanId: ctx.artisanId,
      type: "succes",
      titre: "Facture envoyée",
      message: `La facture ${factureData.numero} a été envoyée à ${client.email}`,
      lien: `/factures/${factureData.id}`,
    });
  }

  return { ...result, numero: factureData.numero, to: client.email };
}

async function execEnvoyerFacture(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.factureId) return fail("factureId est requis");
  try {
    const result = await sendFactureEmailHelper(Number(input.factureId), input.messagePersonnalise, ctx);
    if (!result.success) return fail(result.message);
    return ok({ numero: result.numero, to: result.to, message: `Facture ${result.numero} envoyée à ${result.to}` });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de l'envoi de la facture");
  }
}

async function execEnvoyerRelance(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.factureId) return fail("factureId est requis");
  try {
    const factureData = await db.getFactureById(Number(input.factureId));
    if (!factureData) return fail("Facture introuvable");
    if (factureData.artisanId !== ctx.artisanId) return fail("Cette facture n'appartient pas à votre compte");

    const artisan = await db.getArtisanById(ctx.artisanId);
    const client = await db.getClientById(factureData.clientId);
    if (!client?.email) return fail("Le client n'a pas d'adresse email");

    const joursRetard = factureData.dateEcheance
      ? Math.max(0, Math.floor((Date.now() - new Date(factureData.dateEcheance).getTime()) / 86400000))
      : 0;

    const { subject, body } = generateRappelFactureContent({
      artisanName: artisan?.nomEntreprise || "Votre artisan",
      clientName: `${client.prenom || ""} ${client.nom}`.trim(),
      factureNumero: factureData.numero,
      totalTTC: `${parseFloat(factureData.totalTTC || "0").toFixed(2)} €`,
      joursRetard,
    });

    const finalBody = input.messagePersonnalise
      ? `${body}\n\n${input.messagePersonnalise}`
      : body;

    const result = await sendEmail({
      to: client.email,
      subject,
      body: finalBody.replace(/\n/g, "<br>"),
    });

    if (!result.success) return fail(result.message);

    await db.createNotification({
      artisanId: ctx.artisanId,
      type: "info",
      titre: "Relance envoyée",
      message: `Relance pour facture ${factureData.numero} envoyée à ${client.email}`,
      lien: `/factures/${factureData.id}`,
    });

    return ok({
      numero: factureData.numero,
      to: client.email,
      joursRetard,
      message: `Relance envoyée à ${client.email} (facture ${factureData.numero}, ${joursRetard} j de retard)`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de l'envoi de la relance");
  }
}

async function execCreerIntervention(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.clientId || !input?.titre || !input?.dateDebut || !input?.dateFin) {
    return fail("clientId, titre, dateDebut et dateFin sont requis");
  }
  try {
    await assertClientBelongs(Number(input.clientId), ctx);
    const dateDebut = new Date(input.dateDebut);
    const dateFin = new Date(input.dateFin);
    if (isNaN(dateDebut.getTime()) || isNaN(dateFin.getTime())) {
      return fail("Format de date invalide (utiliser ISO 8601)");
    }
    const intervention = await db.createIntervention({
      artisanId: ctx.artisanId,
      clientId: Number(input.clientId),
      titre: input.titre,
      description: input.description || undefined,
      dateDebut,
      dateFin,
      adresse: input.adresse || undefined,
      statut: "planifiee",
    } as any);
    return ok({
      interventionId: intervention.id,
      titre: intervention.titre,
      dateDebut: intervention.dateDebut,
      message: `Intervention "${intervention.titre}" planifiée le ${dateDebut.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création de l'intervention");
  }
}

async function execListerFacturesImpayees(_input: any, ctx: ToolContext): Promise<ToolResult> {
  const factures = await db.getFacturesByArtisanId(ctx.artisanId);
  const now = Date.now();
  const impayees = factures
    .filter((f: any) => f.statut !== "payee" && f.statut !== "annulee" && f.statut !== "brouillon")
    .map((f: any) => {
      const joursRetard = f.dateEcheance
        ? Math.max(0, Math.floor((now - new Date(f.dateEcheance).getTime()) / 86400000))
        : 0;
      return {
        id: f.id,
        numero: f.numero,
        clientId: f.clientId,
        totalTTC: f.totalTTC,
        statut: f.statut,
        dateEcheance: f.dateEcheance,
        joursRetard,
      };
    })
    .sort((a, b) => b.joursRetard - a.joursRetard);
  return ok({ count: impayees.length, factures: impayees });
}

async function execListerDevisEnAttente(_input: any, ctx: ToolContext): Promise<ToolResult> {
  const devisList = await db.getDevisByArtisanId(ctx.artisanId);
  const enAttente = devisList
    .filter((d: any) => d.statut === "envoye")
    .map((d: any) => ({
      id: d.id,
      numero: d.numero,
      clientId: d.clientId,
      objet: d.objet,
      totalTTC: d.totalTTC,
      dateDevis: d.dateDevis,
      joursDepuisEnvoi: d.dateDevis
        ? Math.floor((Date.now() - new Date(d.dateDevis).getTime()) / 86400000)
        : 0,
    }))
    .sort((a, b) => b.joursDepuisEnvoi - a.joursDepuisEnvoi);
  return ok({ count: enAttente.length, devis: enAttente });
}

// ============================================================================
// Dispatcher
// ============================================================================

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  switch (name) {
    case "chercher_client":
      return execChercherClient(input as any, ctx);
    case "creer_devis":
      return execCreerDevis(input as any, ctx);
    case "envoyer_devis":
      return execEnvoyerDevis(input as any, ctx);
    case "creer_et_envoyer_devis":
      return execCreerEtEnvoyerDevis(input as any, ctx);
    case "creer_facture":
      return execCreerFacture(input as any, ctx);
    case "envoyer_facture":
      return execEnvoyerFacture(input as any, ctx);
    case "envoyer_relance":
      return execEnvoyerRelance(input as any, ctx);
    case "creer_intervention":
      return execCreerIntervention(input as any, ctx);
    case "lister_factures_impayees":
      return execListerFacturesImpayees(input as any, ctx);
    case "lister_devis_en_attente":
      return execListerDevisEnAttente(input as any, ctx);
    default:
      return fail(`Outil inconnu: ${name}`);
  }
}
