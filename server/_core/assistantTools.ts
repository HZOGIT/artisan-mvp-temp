import { Type, type FunctionDeclaration } from '@google/genai';
import * as db from "../db";
import {
  sendEmail,
  generateFactureEmailContent,
} from "./emailService";

// ============================================================================
// Tool definitions exposées à Claude (function calling)
// ============================================================================

export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: "chercher_client",
    description:
      "Recherche un client par nom, prénom, entreprise ou email. Insensible à la casse et aux accents. Accepte une requête multi-mots (ex: 'Michel dad' trouve DAD Michel) : matche TOUS les mots dans n'importe quel ordre, et tombe en mode partiel scoré si aucun match strict. Retourne jusqu'à 5 résultats. À utiliser AVANT toute action liée à un client si tu n'as pas son ID.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nom: {
          type: Type.STRING,
          description: "Mots à chercher (nom, prénom, entreprise, email). Peut contenir plusieurs mots séparés par des espaces.",
        },
      },
      required: ["nom"],
    },
  },
  {
    name: "creer_devis",
    description:
      "Crée un nouveau devis en brouillon pour un client avec ses lignes. Retourne le numéro et l'ID du devis créé. Calcule automatiquement les totaux HT/TVA/TTC.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientId: { type: Type.NUMBER, description: "ID du client (obtenu via chercher_client)" },
        objet: { type: Type.STRING, description: "Objet/titre du devis" },
        lignes: {
          type: Type.ARRAY,
          description: "Lignes du devis avec leurs montants",
          items: {
            type: Type.OBJECT,
            properties: {
              designation: { type: Type.STRING },
              quantite: { type: Type.NUMBER },
              unite: { type: Type.STRING, description: "Ex: u, h, m, m², forfait" },
              prixUnitaireHT: { type: Type.NUMBER },
              tauxTVA: { type: Type.NUMBER, description: "En pourcentage, ex: 20" },
            },
            required: ["designation", "quantite", "prixUnitaireHT"],
          },
        },
        notes: { type: Type.STRING, description: "Notes ou conditions particulières (optionnel)" },
        validiteDays: {
          type: Type.NUMBER,
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
    parameters: {
      type: Type.OBJECT,
      properties: {
        devisId: { type: Type.NUMBER },
        messagePersonnalise: {
          type: Type.STRING,
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
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientId: { type: Type.NUMBER },
        objet: { type: Type.STRING },
        lignes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              designation: { type: Type.STRING },
              quantite: { type: Type.NUMBER },
              unite: { type: Type.STRING },
              prixUnitaireHT: { type: Type.NUMBER },
              tauxTVA: { type: Type.NUMBER },
            },
            required: ["designation", "quantite", "prixUnitaireHT"],
          },
        },
        messageEmail: { type: Type.STRING, description: "Message personnalisé pour l'email (optionnel)" },
      },
      required: ["clientId", "objet", "lignes"],
    },
  },
  {
    name: "creer_facture",
    description:
      "Crée une facture pour un client. Si devisId est fourni, la facture est créée à partir du devis (recopie clientId, lignes, totaux). Sinon, crée la facture avec les lignes fournies.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientId: { type: Type.NUMBER, description: "Requis si pas de devisId" },
        devisId: { type: Type.NUMBER, description: "ID du devis source (optionnel)" },
        objet: { type: Type.STRING },
        lignes: {
          type: Type.ARRAY,
          description: "Requis si pas de devisId",
          items: {
            type: Type.OBJECT,
            properties: {
              designation: { type: Type.STRING },
              quantite: { type: Type.NUMBER },
              unite: { type: Type.STRING },
              prixUnitaireHT: { type: Type.NUMBER },
              tauxTVA: { type: Type.NUMBER },
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
    parameters: {
      type: Type.OBJECT,
      properties: {
        factureId: { type: Type.NUMBER },
        messagePersonnalise: { type: Type.STRING },
      },
      required: ["factureId"],
    },
  },
  {
    name: "envoyer_relance",
    description:
      "Envoie une relance pour une facture impayée. Utilise un message de rappel adapté avec le nombre de jours de retard.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        factureId: { type: Type.NUMBER },
        messagePersonnalise: { type: Type.STRING },
      },
      required: ["factureId"],
    },
  },
  {
    name: "creer_intervention",
    description:
      "Planifie une intervention dans le calendrier. Les dates doivent être au format ISO 8601 (ex: 2026-05-13T08:00:00). Le titre doit décrire la nature du travail (ex: 'Débouchage WC', 'Réparation fuite', 'Entretien chaudière') — pas un libellé générique. L'adresse est facultative : si non fournie, l'adresse postale du client est utilisée automatiquement.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientId: { type: Type.NUMBER },
        titre: {
          type: Type.STRING,
          description:
            "Nature du travail à effectuer, déduite de la demande de l'artisan. Exemples : 'Débouchage WC', 'Réparation fuite cuisine', 'Entretien chaudière annuel', 'Installation chauffe-eau'. Utilise 'Intervention' uniquement si aucun détail n'a été donné.",
        },
        description: { type: Type.STRING, description: "Notes ou détails complémentaires (optionnel)." },
        dateDebut: { type: Type.STRING, description: "Date/heure ISO 8601" },
        dateFin: { type: Type.STRING, description: "Date/heure ISO 8601" },
        adresse: {
          type: Type.STRING,
          description:
            "Adresse de l'intervention (optionnel). Si vide, l'adresse postale du client est utilisée automatiquement.",
        },
      },
      required: ["clientId", "titre", "dateDebut", "dateFin"],
    },
  },
  {
    name: "lister_factures_impayees",
    description:
      "Liste toutes les factures non payées (statut envoyée ou en retard). Retourne id, numéro, client, montantTTC, date échéance, jours de retard.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "lister_devis_en_attente",
    description:
      "Liste les devis envoyés en attente de réponse du client (statut envoye). Retourne id, numéro, client, montantTTC, date du devis.",
    parameters: { type: Type.OBJECT, properties: {} },
  },

  // ── Stocks & commandes fournisseurs ────────────────────────────────────
  {
    name: "verifier_stocks",
    description:
      "Vérifie tous les niveaux de stock. Retourne la liste des articles avec leur quantité, seuil d'alerte et statut (rupture | alerte | ok), ainsi qu'un récapitulatif des articles à réapprovisionner.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "creer_commande_fournisseur",
    description:
      "Crée un bon de commande fournisseur en brouillon pour réapprovisionner des articles. Retourne le numéro et l'id de la commande créée.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fournisseurId: { type: Type.NUMBER, description: "ID du fournisseur (obtenu via chercher_fournisseur ou lister_fournisseurs)" },
        lignes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              designation: { type: Type.STRING },
              quantite: { type: Type.NUMBER },
              unite: { type: Type.STRING },
              prixUnitaireHT: { type: Type.NUMBER },
            },
            required: ["designation", "quantite"],
          },
        },
        notes: { type: Type.STRING },
        delaiLivraison: { type: Type.STRING, description: "Texte libre, ex: '2 semaines'" },
      },
      required: ["fournisseurId", "lignes"],
    },
  },
  {
    name: "envoyer_commande_fournisseur",
    description: "Envoie un bon de commande par email au fournisseur avec le PDF en pièce jointe.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        commandeId: { type: Type.NUMBER },
        messagePersonnalise: { type: Type.STRING },
      },
      required: ["commandeId"],
    },
  },

  // ── Clients ────────────────────────────────────────────────────────────
  {
    name: "lister_clients",
    description:
      "Liste les clients de l'artisan. Filtre optionnel par substring sur le nom/prénom/entreprise. Limite à 50 résultats.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filtre: { type: Type.STRING, description: "Texte de filtrage (optionnel)" },
      },
    },
  },
  {
    name: "creer_client",
    description:
      "Crée un nouveau client dans la base. Retourne l'id et le nom du client créé.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nom: { type: Type.STRING },
        prenom: { type: Type.STRING },
        email: { type: Type.STRING },
        telephone: { type: Type.STRING },
        adresse: { type: Type.STRING },
        ville: { type: Type.STRING },
        codePostal: { type: Type.STRING },
        type: { type: Type.STRING },
      },
      required: ["nom"],
    },
  },

  // ── Statistiques ───────────────────────────────────────────────────────
  {
    name: "get_statistiques",
    description:
      "Récupère les statistiques complètes de l'activité : CA du mois, CA de l'année, nombre de clients, devis en cours, factures impayées, interventions à venir, articles en rupture.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        periode: {
          type: Type.STRING,
          description: "Optionnel — par défaut renvoie un récapitulatif complet incluant mois et année.",
        },
      },
    },
  },

  // ── Fournisseurs ───────────────────────────────────────────────────────
  {
    name: "lister_fournisseurs",
    description: "Liste tous les fournisseurs enregistrés avec leurs coordonnées.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "chercher_fournisseur",
    description: "Recherche un fournisseur par nom. Insensible à la casse, retourne jusqu'à 5 résultats.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nom: { type: Type.STRING },
      },
      required: ["nom"],
    },
  },

  // ── Planning ───────────────────────────────────────────────────────────
  {
    name: "lister_interventions",
    description:
      "Liste les interventions planifiées. Filtres optionnels par statut, dateDebut (>=), dateFin (<=).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        statut: { type: Type.STRING, description: "planifiee | en_cours | terminee | annulee" },
        dateDebut: { type: Type.STRING, description: "ISO 8601" },
        dateFin: { type: Type.STRING, description: "ISO 8601" },
      },
    },
  },
  {
    name: "modifier_intervention",
    description:
      "Modifie une intervention existante. Seuls les champs fournis sont mis à jour.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        interventionId: { type: Type.NUMBER },
        titre: { type: Type.STRING },
        dateDebut: { type: Type.STRING },
        dateFin: { type: Type.STRING },
        statut: { type: Type.STRING, description: "planifiee | en_cours | terminee | annulee" },
        notes: { type: Type.STRING },
      },
      required: ["interventionId"],
    },
  },

  // ── Navigation UI ──────────────────────────────────────────────────────
  {
    name: "naviguer_vers",
    description:
      "Redirige l'artisan vers une page de l'application avec un filtre optionnel pour afficher des données spécifiques. À appeler APRÈS avoir listé des données pour que l'artisan puisse voir tous les résultats filtrés dans la page concernée. Le résumé court reste affiché dans le panneau de chat.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        page: {
          type: Type.STRING,
          description: "Page de destination : /factures, /devis, /clients, /interventions, /stocks, /commandes",
        },
        filtre: {
          type: Type.STRING,
          description:
            "Filtre à appliquer sur la page. Valeurs valides selon la page : factures → impayees, en_retard, brouillon ; devis → brouillon, envoye, accepte, refuse ; interventions → planifiee, en_cours, terminee ; stocks → rupture, alerte ; commandes → brouillon, envoyee.",
        },
        message: {
          type: Type.STRING,
          description: "Message court affiché à l'artisan pour confirmer la navigation (optionnel).",
        },
      },
      required: ["page"],
    },
  },
];

// ============================================================================
// Mapping outil → caches à invalider côté client
// ============================================================================
//
// Chaque entrée déclare les clés de cache tRPC (matchées en substring sur le
// queryKey) que le client doit invalider après l'exécution réussie de l'outil.
// La route SSE émet un event { invalidate: [...] } juste après chaque tool_use,
// et useAssistantStream rappelle le queryClient pour invalider.
//
// Notifications est inclus pour les outils qui créent une notification (envoi
// devis/facture/relance/commande) afin de rafraîchir la cloche en temps réel.

export const TOOL_INVALIDATIONS: Record<string, string[]> = {
  creer_client: ["clients"],
  creer_devis: ["devis"],
  envoyer_devis: ["devis", "notifications"],
  creer_et_envoyer_devis: ["devis", "notifications"],
  creer_facture: ["factures", "devis"],
  envoyer_facture: ["factures", "notifications"],
  envoyer_relance: ["factures", "notifications"],
  creer_intervention: ["interventions"],
  modifier_intervention: ["interventions"],
  creer_commande_fournisseur: ["commandesFournisseurs"],
  envoyer_commande_fournisseur: ["commandesFournisseurs", "notifications"],
};

// ============================================================================
// Tool executors
// ============================================================================

export interface ToolContext {
  artisanId: number;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const PUBLIC_BASE_URL = process.env.APP_URL || "https://www.operioz.com";

/**
 * Construit le corps HTML d'un email de devis avec lien de signature électronique.
 * Réutilise le format visuel des emails Operioz + ajoute un gros bouton "Consulter
 * et signer". Le paragraphe d'intro garde le pattern "Veuillez trouver ci-joint…"
 * pour rester compatible avec applyCustomEmailMessage.
 */
function buildDevisSignatureEmailBody(params: {
  artisanName: string;
  clientName: string;
  devisNumero: string;
  devisObjet?: string;
  totalTTC: string;
  dateValidite?: string;
  signatureUrl: string;
}): { subject: string; body: string } {
  const { artisanName, clientName, devisNumero, devisObjet, totalTTC, dateValidite, signatureUrl } = params;
  const subject = `Devis ${devisNumero}${devisObjet ? ` - ${devisObjet}` : ""} de ${artisanName}`;
  const body = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${artisanName}</h1>
        </td></tr>

        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${clientName},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint le devis <strong>${devisNumero}</strong>${devisObjet ? ` concernant <em>&laquo;&nbsp;${devisObjet}&nbsp;&raquo;</em>` : ""} d'un montant de <strong>${totalTTC}</strong>${dateValidite ? `, valable jusqu'au <strong>${dateValidite}</strong>` : ""}. Vous pouvez le consulter et le signer électroniquement en un clic.</p>
        </td></tr>

        <tr><td style="padding:0 40px 24px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro du devis</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${devisNumero}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Montant TTC</td>
                  <td style="padding:6px 0;font-size:16px;color:#1e40af;font-weight:700;text-align:right;border-top:1px solid #dbeafe;">${totalTTC}</td>
                </tr>
                ${dateValidite ? `<tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Valable jusqu'au</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #dbeafe;">${dateValidite}</td>
                </tr>` : ""}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 12px 40px;text-align:center;">
          <a href="${signatureUrl}" style="display:inline-block;background-color:#1e40af;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:600;">Consulter et signer le devis</a>
        </td></tr>

        <tr><td style="padding:0 40px 32px 40px;text-align:center;">
          <p style="margin:0 0 6px 0;font-size:13px;color:#9ca3af;">Ce lien est valide pendant 30 jours.</p>
          <p style="margin:0 0 16px 0;font-size:13px;color:#9ca3af;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : ${signatureUrl}</p>
          <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p>
          <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p>
        </td></tr>

        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis Operioz</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, body };
}

/**
 * Construit le corps HTML d'un email de relance facture impayée — même format
 * visuel que les autres emails Operioz. Le paragraphe d'intro garde le pattern
 * "Veuillez trouver ci-joint…" pour applyCustomEmailMessage.
 */
function buildRelanceEmailBody(params: {
  artisanName: string;
  clientName: string;
  factureNumero: string;
  totalTTC: string;
  joursRetard: number;
}): { subject: string; body: string } {
  const { artisanName, clientName, factureNumero, totalTTC, joursRetard } = params;
  const subject = `Rappel : facture ${factureNumero} en attente de règlement`;
  const body = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td style="background-color:#dc2626;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${artisanName}</h1>
        </td></tr>

        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${clientName},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint un rappel concernant la facture <strong>${factureNumero}</strong> d'un montant de <strong>${totalTTC}</strong>, en attente de règlement depuis ${joursRetard} jour(s).</p>
        </td></tr>

        <tr><td style="padding:0 40px 28px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de facture</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${factureNumero}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #fecaca;">Montant TTC</td>
                  <td style="padding:6px 0;font-size:16px;color:#dc2626;font-weight:700;text-align:right;border-top:1px solid #fecaca;">${totalTTC}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #fecaca;">Jours de retard</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #fecaca;">${joursRetard}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 36px 40px;">
          <p style="margin:0 0 14px 0;font-size:15px;color:#374151;line-height:1.6;">Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.</p>
          <p style="margin:0 0 24px 0;font-size:13px;color:#9ca3af;font-style:italic;">Si vous avez déjà effectué le paiement, veuillez ignorer ce message.</p>
          <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p>
          <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p>
        </td></tr>

        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis Operioz</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, body };
}

/**
 * Récupère ou crée un lien de signature électronique pour un devis donné.
 * Réutilise exactement le même mécanisme que la mutation tRPC manuelle
 * `signature.createSignatureLink` (mêmes table, token, validité 30 jours).
 */
async function getOrCreateDevisSignatureUrl(devisId: number): Promise<string> {
  const existing = await db.getSignatureByDevisId(devisId);
  if (existing) {
    return `${PUBLIC_BASE_URL}/devis-public/${existing.token}`;
  }
  const token =
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await db.createSignatureDevis({ devisId, token, expiresAt });
  return `${PUBLIC_BASE_URL}/devis-public/${token}`;
}

/**
 * Injecte le messagePersonnalise dans le corps HTML en REMPLAÇANT le paragraphe
 * d'introduction par défaut ("Veuillez trouver ci-joint le devis/la facture…").
 * Évite la duplication où le message apparaissait à la fois dans le template ET
 * en italique en bas du mail.
 */
function applyCustomEmailMessage(body: string, msg: string | undefined): string {
  if (!msg) return body;
  const formatted = msg.replace(/\n/g, "<br>");
  const intro = `<p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">${formatted}</p>`;
  const replaced = body.replace(
    /<p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1\.6;">Veuillez trouver ci-joint[\s\S]*?<\/p>/,
    intro
  );
  // Fallback si le template change : injecte en bas sans italique pour rester lisible.
  if (replaced === body) {
    return body.replace(
      "</body>",
      `<div style="padding:0 40px 24px 40px;font-size:14px;color:#374151;line-height:1.5;">${formatted}</div></body>`
    );
  }
  return replaced;
}

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}
function fail(error: string): ToolResult {
  return { ok: false, error };
}

/**
 * Garde-fou et trace de sécurité avant tout envoi d'email par l'IA.
 *
 * Vérifie que le destinataire (client/fournisseur) appartient bien à
 * l'artisan courant — défense en profondeur au cas où un identifiant
 * mal référencé pointerait vers une entité d'un autre tenant. Logue
 * ensuite la correspondance entité → destinataire pour permettre la
 * traçabilité dans Railway en cas d'incident.
 *
 * Throw si le destinataire n'appartient pas à l'artisan : le helper
 * appelant capture l'erreur et la remonte comme fail() au tool.
 */
function assertEmailRecipient(params: {
  ctx: ToolContext;
  entity: string; // "Devis", "Facture", "Relance", "Commande"
  entityId: number | string;
  entityNumero?: string | null;
  recipient: {
    type: "client" | "fournisseur";
    id: number;
    artisanId: number | null | undefined;
    nom?: string | null;
    prenom?: string | null;
    email?: string | null;
  };
}): void {
  const { ctx, entity, entityId, entityNumero, recipient } = params;
  if (recipient.artisanId !== ctx.artisanId) {
    throw new Error(
      `Sécurité: ${recipient.type} #${recipient.id} n'appartient pas à votre compte`
    );
  }
  if (!recipient.email) {
    throw new Error(`Le ${recipient.type} n'a pas d'adresse email`);
  }
  const displayName =
    recipient.type === "client"
      ? `${recipient.prenom || ""} ${recipient.nom || ""}`.trim() || `#${recipient.id}`
      : recipient.nom || `#${recipient.id}`;
  const numeroPart = entityNumero ? ` (numero=${entityNumero})` : "";
  console.log(
    `[EMAIL-SECURITY] ${entity} #${entityId}${numeroPart} → ${recipient.type}Id=${recipient.id} (${displayName}) → email=${recipient.email}`
  );
}

/**
 * Normalise une chaîne pour la recherche tolérante : lower-case, trim, suppression
 * des accents (NFD + filtrage des diacritiques). "Mëlissâ" → "melissa".
 */
function normalizeForSearch(s: string | null | undefined): string {
  // NFD décompose les caractères accentués (é → e + ́). Le range ̀-ͯ
  // couvre les "combining diacritical marks" qu'on supprime ensuite.
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function execChercherClient(input: any, ctx: ToolContext): Promise<ToolResult> {
  const raw = String(input?.nom || "").trim();
  if (!raw) return fail("Le paramètre 'nom' est requis");
  const queryNorm = normalizeForSearch(raw);
  const words = queryNorm.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return fail("Le paramètre 'nom' est requis");

  const clients = await db.getClientsByArtisanId(ctx.artisanId);
  const haystackOf = (c: any) =>
    normalizeForSearch(
      `${c.prenom || ""} ${c.nom || ""} ${c.entreprise || ""} ${c.email || ""}`
    );

  type Candidate = { c: any; score: number };

  // Passe 1 — la chaîne complète normalisée apparaît telle quelle dans le client.
  let candidates: Candidate[] = clients
    .filter((c: any) => haystackOf(c).includes(queryNorm))
    .map((c: any) => ({ c, score: 1000 }));

  // Passe 2 — TOUS les mots présents (dans n'importe quel ordre, n'importe quel champ).
  // Couvre le cas "Michel dad" → DAD Michel : on cherche "michel" ET "dad" séparément.
  if (candidates.length === 0) {
    candidates = clients
      .filter((c: any) => {
        const h = haystackOf(c);
        return words.every((w) => h.includes(w));
      })
      .map((c: any) => ({ c, score: words.length * 10 }));
  }

  // Passe 3 — recherche partielle : on garde les clients qui matchent au moins
  // un mot, et on trie par nombre de mots matchés décroissant.
  if (candidates.length === 0) {
    candidates = clients
      .map((c: any) => {
        const h = haystackOf(c);
        const score = words.reduce((acc, w) => acc + (h.includes(w) ? 1 : 0), 0);
        return { c, score };
      })
      .filter((m: Candidate) => m.score > 0)
      .sort((a: Candidate, b: Candidate) => b.score - a.score);
  }

  const matches = candidates.slice(0, 5).map(({ c }) => ({
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
  assertEmailRecipient({
    ctx,
    entity: "Devis",
    entityId: devisData.id,
    entityNumero: devisData.numero,
    recipient: {
      type: "client",
      id: client.id,
      artisanId: client.artisanId,
      nom: client.nom,
      prenom: client.prenom,
      email: client.email,
    },
  });

  const lignes = await db.getLignesDevisByDevisId(devisData.id);
  const { generateDevisPDF } = await import("./pdfGenerator");
  const pdfBuffer = generateDevisPDF({ devis: { ...devisData, lignes }, artisan: artisan as any, client });

  // Génère (ou récupère) le lien de signature électronique — même mécanisme
  // que la mutation manuelle signature.createSignatureLink.
  const signatureUrl = await getOrCreateDevisSignatureUrl(devisData.id);

  const totalTTC = `${parseFloat(devisData.totalTTC || "0").toFixed(2)} €`;
  const { subject, body } = buildDevisSignatureEmailBody({
    artisanName: artisan.nomEntreprise || "Votre artisan",
    clientName: `${client.prenom || ""} ${client.nom}`.trim(),
    devisNumero: devisData.numero,
    devisObjet: devisData.objet || undefined,
    totalTTC,
    dateValidite: devisData.dateValidite
      ? new Date(devisData.dateValidite).toLocaleDateString("fr-FR")
      : undefined,
    signatureUrl,
  });

  const finalBody = applyCustomEmailMessage(body, customMessage);

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

  return {
    ...result,
    numero: devisData.numero,
    to: client.email,
    clientId: client.id,
    clientNom: `${client.prenom || ""} ${client.nom || ""}`.trim() || `#${client.id}`,
  };
}

async function execEnvoyerDevis(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.devisId) return fail("devisId est requis");
  try {
    const result = await sendDevisEmailHelper(Number(input.devisId), input.messagePersonnalise, ctx);
    if (!result.success) return fail(result.message);
    return ok({
      numero: result.numero,
      to: result.to,
      clientId: result.clientId,
      clientNom: result.clientNom,
      message: `Devis ${result.numero} envoyé à ${result.clientNom} (${result.to})`,
    });
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
      clientId: sendResult.clientId,
      clientNom: sendResult.clientNom,
      totalTTC: devisRecord.totalTTC,
      message: `Devis ${devisRecord.numero} (${parseFloat(devisRecord.totalTTC || "0").toFixed(2)} €) créé et envoyé à ${sendResult.clientNom} (${sendResult.to})`,
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
  assertEmailRecipient({
    ctx,
    entity: "Facture",
    entityId: factureData.id,
    entityNumero: factureData.numero,
    recipient: {
      type: "client",
      id: client.id,
      artisanId: client.artisanId,
      nom: client.nom,
      prenom: client.prenom,
      email: client.email,
    },
  });

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

  const finalBody = applyCustomEmailMessage(body, customMessage);

  const result = await sendEmail({
    to: client.email,
    fromName: artisan.nomEntreprise || undefined, // OPE-157
    replyTo: (artisan as any).email || undefined,
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

  return {
    ...result,
    numero: factureData.numero,
    to: client.email,
    clientId: client.id,
    clientNom: `${client.prenom || ""} ${client.nom || ""}`.trim() || `#${client.id}`,
  };
}

async function execEnvoyerFacture(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.factureId) return fail("factureId est requis");
  try {
    const result = await sendFactureEmailHelper(Number(input.factureId), input.messagePersonnalise, ctx);
    if (!result.success) return fail(result.message);
    return ok({
      numero: result.numero,
      to: result.to,
      clientId: result.clientId,
      clientNom: result.clientNom,
      message: `Facture ${result.numero} envoyée à ${result.clientNom} (${result.to})`,
    });
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
    if (!client) return fail("Client introuvable");
    if (!client.email) return fail("Le client n'a pas d'adresse email");
    assertEmailRecipient({
      ctx,
      entity: "Relance",
      entityId: factureData.id,
      entityNumero: factureData.numero,
      recipient: {
        type: "client",
        id: client.id,
        artisanId: client.artisanId,
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
      },
    });

    const joursRetard = factureData.dateEcheance
      ? Math.max(0, Math.floor((Date.now() - new Date(factureData.dateEcheance).getTime()) / 86400000))
      : 0;

    const { subject, body } = buildRelanceEmailBody({
      artisanName: artisan?.nomEntreprise || "Votre artisan",
      clientName: `${client.prenom || ""} ${client.nom}`.trim(),
      factureNumero: factureData.numero,
      totalTTC: `${parseFloat(factureData.totalTTC || "0").toFixed(2)} €`,
      joursRetard,
    });

    // Même helper que devis/facture : le messagePersonnalise REMPLACE le paragraphe
    // d'intro par défaut, sans doublon.
    const finalBody = applyCustomEmailMessage(body, input.messagePersonnalise);

    const result = await sendEmail({
      to: client.email,
      subject,
      body: finalBody,
    });

    if (!result.success) return fail(result.message);

    await db.createNotification({
      artisanId: ctx.artisanId,
      type: "info",
      titre: "Relance envoyée",
      message: `Relance pour facture ${factureData.numero} envoyée à ${client.email}`,
      lien: `/factures/${factureData.id}`,
    });

    const clientNom = `${client.prenom || ""} ${client.nom || ""}`.trim() || `#${client.id}`;
    return ok({
      numero: factureData.numero,
      to: client.email,
      clientId: client.id,
      clientNom,
      joursRetard,
      message: `Relance envoyée à ${clientNom} (${client.email}) — facture ${factureData.numero}, ${joursRetard} j de retard`,
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
    // assertClientBelongs renvoie l'enregistrement client : on le réutilise
    // pour récupérer l'adresse postale par défaut.
    const client = await assertClientBelongs(Number(input.clientId), ctx);
    const dateDebut = new Date(input.dateDebut);
    const dateFin = new Date(input.dateFin);
    if (isNaN(dateDebut.getTime()) || isNaN(dateFin.getTime())) {
      return fail("Format de date invalide (utiliser ISO 8601)");
    }

    // Adresse : on prend celle fournie par l'IA si non vide, sinon on
    // recompose depuis l'adresse postale du client (rue + CP + ville).
    const inputAdresse = typeof input.adresse === "string" ? input.adresse.trim() : "";
    const clientAdresse = [client.adresse, client.codePostal, client.ville]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter((p) => p.length > 0)
      .join(" ");
    const adresse = inputAdresse || clientAdresse || undefined;

    const intervention = await db.createIntervention({
      artisanId: ctx.artisanId,
      clientId: Number(input.clientId),
      titre: input.titre,
      description: input.description || undefined,
      dateDebut,
      dateFin,
      adresse,
      statut: "planifiee",
    } as any);

    const clientFullName = `${client.prenom || ""} ${client.nom || ""}`.trim() || `Client #${client.id}`;
    const dateLabel = dateDebut.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const heureFin = dateFin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    return ok({
      interventionId: intervention.id,
      titre: intervention.titre,
      client: clientFullName,
      adresse: adresse || null,
      dateDebut: intervention.dateDebut,
      dateFin: intervention.dateFin,
      message: `Intervention « ${intervention.titre} » planifiée pour ${clientFullName}${adresse ? ` à ${adresse}` : ""} le ${dateLabel} (jusqu'à ${heureFin}). ID #${intervention.id}.`,
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
// Stocks & commandes fournisseurs
// ============================================================================

async function execVerifierStocks(_input: any, ctx: ToolContext): Promise<ToolResult> {
  const stocks = await db.getStocksByArtisanId(ctx.artisanId);
  const items = stocks.map((s: any) => {
    const quantite = Number(s.quantite ?? 0);
    const seuil = Number(s.seuilAlerte ?? s.seuil ?? 0);
    let statut: "rupture" | "alerte" | "ok" = "ok";
    if (quantite <= 0) statut = "rupture";
    else if (seuil > 0 && quantite <= seuil) statut = "alerte";
    return {
      id: s.id,
      designation: s.designation || s.nom || `Article #${s.id}`,
      quantite,
      seuil,
      unite: s.unite || "u",
      statut,
    };
  });
  const ruptures = items.filter(i => i.statut === "rupture");
  const alertes = items.filter(i => i.statut === "alerte");
  return ok({
    total: items.length,
    nbRuptures: ruptures.length,
    nbAlertes: alertes.length,
    aReapprovisionner: [...ruptures, ...alertes].slice(0, 30),
    tousLesArticles: items.slice(0, 50),
  });
}

async function assertFournisseurBelongs(fournisseurId: number, ctx: ToolContext): Promise<any> {
  const f = await db.getFournisseurById(fournisseurId);
  if (!f) throw new Error("Fournisseur introuvable");
  if ((f as any).artisanId !== ctx.artisanId) throw new Error("Ce fournisseur n'appartient pas à votre compte");
  return f;
}

async function execCreerCommandeFournisseur(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.fournisseurId || !Array.isArray(input?.lignes) || input.lignes.length === 0) {
    return fail("fournisseurId et au moins une ligne sont requis");
  }
  try {
    await assertFournisseurBelongs(Number(input.fournisseurId), ctx);
    const numero = await db.getNextCommandeNumero(ctx.artisanId);

    let totalHT = 0;
    let totalTVA = 0;
    const linesData: any[] = [];
    for (let i = 0; i < input.lignes.length; i++) {
      const l = input.lignes[i];
      const quantite = Number(l.quantite) || 0;
      const prix = Number(l.prixUnitaireHT) || 0;
      const tva = Number(l.tauxTVA ?? 20);
      const mHT = quantite * prix;
      const mTVA = (mHT * tva) / 100;
      totalHT += mHT;
      totalTVA += mTVA;
      linesData.push({
        ordre: i + 1,
        designation: l.designation,
        quantite: String(quantite),
        unite: l.unite || "u",
        prixUnitaire: String(prix),
        tauxTVA: String(tva),
      });
    }
    const totalTTC = totalHT + totalTVA;

    const commande = await db.createCommandeFournisseur({
      artisanId: ctx.artisanId,
      fournisseurId: Number(input.fournisseurId),
      numero,
      dateCommande: new Date(),
      statut: "brouillon",
      notes: input.notes || undefined,
      delaiLivraison: input.delaiLivraison || undefined,
      totalHT: totalHT.toFixed(2),
      totalTVA: totalTVA.toFixed(2),
      totalTTC: totalTTC.toFixed(2),
    } as any);

    for (const lineData of linesData) {
      await db.createLigneCommandeFournisseur({
        commandeId: commande.id,
        ...lineData,
      } as any);
    }

    return ok({
      commandeId: commande.id,
      numero: commande.numero,
      totalTTC: commande.totalTTC,
      message: `Bon de commande ${commande.numero} créé en brouillon (${totalTTC.toFixed(2)} € TTC)`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création de la commande");
  }
}

async function execEnvoyerCommandeFournisseur(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.commandeId) return fail("commandeId est requis");
  try {
    const commande = await db.getCommandeFournisseurById(Number(input.commandeId));
    if (!commande) return fail("Commande introuvable");
    if ((commande as any).artisanId !== ctx.artisanId) return fail("Cette commande n'appartient pas à votre compte");

    const fournisseur = await db.getFournisseurById((commande as any).fournisseurId);
    if (!fournisseur) return fail("Fournisseur introuvable");
    if (!(fournisseur as any).email) return fail("Le fournisseur n'a pas d'adresse email");
    assertEmailRecipient({
      ctx,
      entity: "Commande",
      entityId: commande.id,
      entityNumero: (commande as any).numero,
      recipient: {
        type: "fournisseur",
        id: (fournisseur as any).id,
        artisanId: (fournisseur as any).artisanId,
        nom: (fournisseur as any).nom,
        email: (fournisseur as any).email,
      },
    });

    const artisan = await db.getArtisanById(ctx.artisanId);
    if (!artisan) return fail("Profil artisan introuvable");

    const lignes = await db.getLignesCommandeFournisseur(commande.id);
    const { generateBonCommandePDF } = await import("./pdfGenerator");
    const pdfBuffer = generateBonCommandePDF({
      commande: { ...commande, lignes } as any,
      artisan: artisan as any,
      fournisseur: fournisseur as any,
    });

    const artisanName = (artisan as any).nomEntreprise || "Votre artisan";
    const fournisseurNom = (fournisseur as any).nom || "Fournisseur";
    const totalTTC = `${parseFloat((commande as any).totalTTC || "0").toFixed(2)} €`;
    const body = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background-color:#166534;padding:28px 40px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${artisanName}</h1></td></tr>
<tr><td style="padding:36px 40px 16px 40px;"><p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${fournisseurNom},</p>
<p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint le bon de commande <strong>${(commande as any).numero}</strong>.</p></td></tr>
<tr><td style="padding:0 40px 28px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;"><tr><td style="padding:20px 24px;font-size:14px;color:#111827;"><strong>Numéro :</strong> ${(commande as any).numero}<br><strong>Montant TTC :</strong> ${totalTTC}${(commande as any).delaiLivraison ? `<br><strong>Délai souhaité :</strong> ${(commande as any).delaiLivraison}` : ""}</td></tr></table></td></tr>
<tr><td style="padding:0 40px 36px 40px;"><p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p><p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p></td></tr>
<tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis Operioz</p></td></tr>
</table></td></tr></table></body></html>`;

    const finalBody = applyCustomEmailMessage(body, input.messagePersonnalise);

    const result = await sendEmail({
      to: (fournisseur as any).email,
      subject: `Bon de commande ${(commande as any).numero} — ${artisanName}`,
      body: finalBody,
      attachmentName: `BonCommande_${(commande as any).numero}.pdf`,
      attachmentContent: pdfBuffer.toString("base64"),
    });

    if (!result.success) return fail(result.message);

    await db.updateCommandeFournisseur(commande.id, { statut: "envoyee" } as any);
    await db.createNotification({
      artisanId: ctx.artisanId,
      type: "succes",
      titre: "Commande envoyée",
      message: `Bon de commande ${(commande as any).numero} envoyé à ${(fournisseur as any).email}`,
      lien: `/commandes/${commande.id}`,
    });

    return ok({
      numero: (commande as any).numero,
      to: (fournisseur as any).email,
      fournisseurId: (fournisseur as any).id,
      fournisseurNom: (fournisseur as any).nom,
      message: `Bon de commande ${(commande as any).numero} envoyé à ${(fournisseur as any).nom} (${(fournisseur as any).email})`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de l'envoi de la commande");
  }
}

// ============================================================================
// Clients (étendu)
// ============================================================================

async function execListerClients(input: any, ctx: ToolContext): Promise<ToolResult> {
  const clients = await db.getClientsByArtisanId(ctx.artisanId);
  const filtre = String(input?.filtre || "").toLowerCase().trim();
  const filtered = filtre
    ? clients.filter((c: any) => {
        const full = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase();
        const entreprise = (c.entreprise || "").toLowerCase();
        return full.includes(filtre) || entreprise.includes(filtre);
      })
    : clients;
  const limited = filtered.slice(0, 50).map((c: any) => ({
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    entreprise: c.entreprise || null,
    email: c.email || null,
    telephone: c.telephone || null,
    ville: c.ville || null,
  }));
  return ok({ count: limited.length, total: filtered.length, clients: limited });
}

async function execCreerClient(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.nom) return fail("Le nom est requis");
  try {
    // Le champ "type" n'existe pas en DB ; on l'archive en notes si fourni.
    const notesParts: string[] = [];
    if (input.type) notesParts.push(`Type : ${input.type}`);
    const client = await db.createClient(ctx.artisanId, {
      nom: input.nom,
      prenom: input.prenom || undefined,
      email: input.email || undefined,
      telephone: input.telephone || undefined,
      adresse: input.adresse || undefined,
      ville: input.ville || undefined,
      codePostal: input.codePostal || undefined,
      notes: notesParts.length > 0 ? notesParts.join(" — ") : undefined,
    } as any);
    return ok({
      clientId: client.id,
      nom: client.nom,
      message: `Client ${client.prenom ? client.prenom + " " : ""}${client.nom} créé (ID ${client.id})`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la création du client");
  }
}

// ============================================================================
// Statistiques
// ============================================================================

async function execGetStatistiques(input: any, ctx: ToolContext): Promise<ToolResult> {
  const stats = await db.getDashboardStats(ctx.artisanId);
  const stocksBas = await db.getLowStockItems(ctx.artisanId);
  const ruptures = await db.getStocksEnRupture(ctx.artisanId);
  const interventions = await db.getInterventionsByArtisanId(ctx.artisanId);
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const interventionsSemaine = interventions.filter((i: any) => {
    const d = new Date(i.dateDebut);
    return d >= now && d <= weekFromNow && i.statut === "planifiee";
  }).length;
  return ok({
    periode: input?.periode || "mois+annee",
    caMois: Number(stats.caMonth || 0).toFixed(2),
    caAnnee: Number(stats.caYear || 0).toFixed(2),
    totalClients: stats.totalClients,
    devisEnCours: stats.devisEnCours,
    facturesImpayeesNb: stats.facturesImpayees.count,
    facturesImpayeesTotal: stats.facturesImpayees.total.toFixed(2),
    interventionsSemaine,
    stocksAlerte: stocksBas.length,
    stocksRupture: ruptures.length,
  });
}

// ============================================================================
// Fournisseurs
// ============================================================================

async function execListerFournisseurs(_input: any, ctx: ToolContext): Promise<ToolResult> {
  const fournisseurs = await db.getFournisseursByArtisanId(ctx.artisanId);
  const limited = fournisseurs.slice(0, 50).map((f: any) => ({
    id: f.id,
    nom: f.nom,
    email: f.email || null,
    telephone: f.telephone || null,
    ville: f.ville || null,
    contact: f.contact || null,
  }));
  return ok({ count: limited.length, fournisseurs: limited });
}

async function execChercherFournisseur(input: any, ctx: ToolContext): Promise<ToolResult> {
  const query = String(input?.nom || "").toLowerCase().trim();
  if (!query) return fail("Le paramètre 'nom' est requis");
  const fournisseurs = await db.getFournisseursByArtisanId(ctx.artisanId);
  const matches = fournisseurs
    .filter((f: any) => (f.nom || "").toLowerCase().includes(query))
    .slice(0, 5)
    .map((f: any) => ({
      id: f.id,
      nom: f.nom,
      email: f.email || null,
      telephone: f.telephone || null,
      ville: f.ville || null,
    }));
  return ok({ matches, count: matches.length });
}

// ============================================================================
// Planning (étendu)
// ============================================================================

async function execListerInterventions(input: any, ctx: ToolContext): Promise<ToolResult> {
  const all = await db.getInterventionsByArtisanId(ctx.artisanId);
  const dateMin = input?.dateDebut ? new Date(input.dateDebut) : null;
  const dateMax = input?.dateFin ? new Date(input.dateFin) : null;
  const filtered = all
    .filter((i: any) => {
      if (input?.statut && i.statut !== input.statut) return false;
      const d = new Date(i.dateDebut);
      if (dateMin && d < dateMin) return false;
      if (dateMax && d > dateMax) return false;
      return true;
    })
    .slice(0, 50)
    .map((i: any) => ({
      id: i.id,
      titre: i.titre,
      clientId: i.clientId,
      dateDebut: i.dateDebut,
      dateFin: i.dateFin,
      statut: i.statut,
      adresse: i.adresse || null,
    }));
  return ok({ count: filtered.length, interventions: filtered });
}

async function execModifierIntervention(input: any, ctx: ToolContext): Promise<ToolResult> {
  if (!input?.interventionId) return fail("interventionId est requis");
  try {
    const existing = await db.getInterventionById(Number(input.interventionId));
    if (!existing) return fail("Intervention introuvable");
    if ((existing as any).artisanId !== ctx.artisanId) {
      return fail("Cette intervention n'appartient pas à votre compte");
    }
    const update: Record<string, any> = {};
    if (input.titre !== undefined) update.titre = input.titre;
    if (input.dateDebut !== undefined) {
      const d = new Date(input.dateDebut);
      if (isNaN(d.getTime())) return fail("dateDebut invalide");
      update.dateDebut = d;
    }
    if (input.dateFin !== undefined) {
      const d = new Date(input.dateFin);
      if (isNaN(d.getTime())) return fail("dateFin invalide");
      update.dateFin = d;
    }
    if (input.statut !== undefined) update.statut = input.statut;
    if (input.notes !== undefined) update.notes = input.notes;
    if (Object.keys(update).length === 0) return fail("Aucun champ à modifier");
    const updated = await db.updateIntervention(Number(input.interventionId), update);
    return ok({
      interventionId: updated?.id,
      titre: updated?.titre,
      statut: updated?.statut,
      message: `Intervention #${input.interventionId} mise à jour`,
    });
  } catch (e: any) {
    return fail(e.message || "Erreur lors de la mise à jour de l'intervention");
  }
}

// ============================================================================
// Navigation UI
// ============================================================================

const VALID_NAV_PAGES = [
  "/factures",
  "/devis",
  "/clients",
  "/interventions",
  "/stocks",
  "/commandes",
];

async function execNaviguerVers(input: any, _ctx: ToolContext): Promise<ToolResult> {
  const page = String(input?.page || "").trim();
  if (!VALID_NAV_PAGES.includes(page)) {
    return fail(`Page invalide : ${page || "(vide)"}. Valeurs autorisées : ${VALID_NAV_PAGES.join(", ")}`);
  }
  const filtre = input?.filtre ? String(input.filtre).trim() : undefined;
  const message = input?.message ? String(input.message).trim() : undefined;
  // Le payload est consommé côté route SSE pour émettre un event 'navigate'
  // au client AVANT de renvoyer le résultat à Claude.
  return ok({
    navigate: { page, filtre, message },
    confirmation: filtre
      ? `Page ${page} ouverte avec le filtre « ${filtre} »`
      : `Page ${page} ouverte`,
  });
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
    // Stocks & commandes fournisseurs
    case "verifier_stocks":
      return execVerifierStocks(input as any, ctx);
    case "creer_commande_fournisseur":
      return execCreerCommandeFournisseur(input as any, ctx);
    case "envoyer_commande_fournisseur":
      return execEnvoyerCommandeFournisseur(input as any, ctx);
    // Clients
    case "lister_clients":
      return execListerClients(input as any, ctx);
    case "creer_client":
      return execCreerClient(input as any, ctx);
    // Statistiques
    case "get_statistiques":
      return execGetStatistiques(input as any, ctx);
    // Fournisseurs
    case "lister_fournisseurs":
      return execListerFournisseurs(input as any, ctx);
    case "chercher_fournisseur":
      return execChercherFournisseur(input as any, ctx);
    // Planning étendu
    case "lister_interventions":
      return execListerInterventions(input as any, ctx);
    case "modifier_intervention":
      return execModifierIntervention(input as any, ctx);
    // Navigation UI
    case "naviguer_vers":
      return execNaviguerVers(input as any, ctx);
    default:
      return fail(`Outil inconnu: ${name}`);
  }
}
