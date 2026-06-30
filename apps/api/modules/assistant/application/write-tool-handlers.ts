import type { TenantContext } from "../../../shared/tenant";
import { tauxStringToCategorie, TVA_CATEGORIES_MAP, type TvaCategorieId } from "../../../shared/tva/taux-tva-fr";
import type { ToolHandler } from "./assistant-tool-registry";

/*
 * Handlers d'ÉCRITURE de l'assistant agentique (Phase 2, opt-in). Chaque écriture est mappée à un
 * use-case DÉJÀ MIGRÉ du domaine (anti-IDOR ownership, validation, jamais de SQL brut) ; on formate
 * le `data` à la **forme legacy** + on capture les exceptions (parité legacy `try/catch → fail`).
 * Phase 2a : `creer_client` + `creer_intervention` (les moins risquées).
 */

const optStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const errMsg = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/** ── Ports d'écriture (satisfaits par les use-cases migrés via un petit adapter au câblage) ────── */
export interface ClientCreateInput {
  readonly nom: string;
  readonly prenom?: string;
  readonly email?: string;
  readonly telephone?: string;
  readonly adresse?: string;
  readonly ville?: string;
  readonly codePostal?: string;
  readonly notes?: string;
}
export interface ClientWriterForAgent {
  create(ctx: TenantContext, input: ClientCreateInput): Promise<{ id: number; nom: string; prenom: string | null }>;
}
export interface ClientByIdReaderForAgent {
  getById(
    ctx: TenantContext,
    id: number,
  ): Promise<{ id: number; nom: string; prenom: string | null; adresse: string | null; codePostal: string | null; ville: string | null } | null>;
}
export interface InterventionCreateInput {
  readonly clientId: number;
  readonly titre: string;
  readonly description?: string;
  readonly dateDebut: Date;
  readonly dateFin: Date;
  readonly adresse?: string;
  readonly statut: "planifiee";
}
export interface InterventionWriterForAgent {
  create(ctx: TenantContext, input: InterventionCreateInput): Promise<{ id: number; titre: string; dateDebut: Date; dateFin: Date | null }>;
}
/** `modifier_intervention` : patch partiel (champs fournis seulement) ; ownership via le use-case migré. */
export interface InterventionUpdatePatch {
  readonly titre?: string;
  readonly dateDebut?: Date;
  readonly dateFin?: Date;
  readonly statut?: string;
  readonly notes?: string;
}
export interface InterventionUpdaterForAgent {
  modifier(ctx: TenantContext, id: number, patch: InterventionUpdatePatch): Promise<{ id: number; titre: string; statut: string }>;
}

/*
 * Devis : on s'appuie sur les use-cases migrés (création header + ajout de lignes, montants HT/TVA/TTC
 * recalculés par le repo) ; l'orchestration (header → lignes → relecture des totaux) reste ici.
 */
export interface DevisLigneInput {
  readonly designation: string;
  readonly quantite: string;
  readonly unite?: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly tvaCategorieId?: string;
}
export interface DevisWriterForAgent {
  creer(ctx: TenantContext, input: { clientId: number; objet: string; notes?: string; dateValidite: Date }): Promise<{ id: number }>;
  ajouterLigne(ctx: TenantContext, devisId: number, ligne: DevisLigneInput): Promise<void>;
  getById(ctx: TenantContext, devisId: number): Promise<{ numero: string; totalTTC: string; statut: string } | null>;
}

/*
 * Facture : 2 modes — depuis un devis (conversion migrée : ⚠️ devis ACCEPTÉ requis + pas déjà
 * converti, invariant durci du module factures) ou depuis des lignes (comme `creer_devis`).
 */
export interface FactureLigneInput {
  readonly designation: string;
  readonly quantite: string;
  readonly unite?: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly tvaCategorieId?: string;
}
export interface FactureWriterForAgent {
  creer(ctx: TenantContext, input: { clientId: number; objet: string; dateEcheance: Date }): Promise<{ id: number }>;
  ajouterLigne(ctx: TenantContext, factureId: number, ligne: FactureLigneInput): Promise<void>;
  convertirDevis(ctx: TenantContext, devisId: number): Promise<{ id: number }>;
  setObjet(ctx: TenantContext, factureId: number, objet: string): Promise<void>;
  getById(ctx: TenantContext, factureId: number): Promise<{ numero: string | null; totalTTC: string; statut: string; objet: string | null } | null>;
}

/*
 * Envoi par email (devis/facture) : mappé aux use-cases d'envoi migrés (PDF via `PdfPort`, email via
 * `EmailPort`, statut→envoye/envoyee, rate-limit). Renvoie `{success, message}` (les erreurs lèvent).
 */
export interface EnvoiResultForAgent {
  readonly success: boolean;
  readonly message: string;
}
export interface DevisSenderForAgent {
  envoyer(ctx: TenantContext, devisId: number, customMessage?: string): Promise<EnvoiResultForAgent>;
}
export interface FactureSenderForAgent {
  envoyer(ctx: TenantContext, factureId: number, customMessage?: string): Promise<EnvoiResultForAgent>;
}
/** Relance d'une facture impayée (use-case migré `envoyerRelanceFacture`, sans PDF). */
export interface RelanceSenderForAgent {
  envoyer(ctx: TenantContext, factureId: number, customMessage?: string): Promise<EnvoiResultForAgent>;
}

/*
 * Commande fournisseur : création (lignes inline, totaux + ownership fournisseur par le use-case
 * migré) + envoi par email (PDF via PdfPort). Legacy `prixUnitaireHT` → `prixUnitaire` migré.
 */
export interface CommandeLigneInput {
  readonly designation: string;
  readonly quantite: string;
  readonly unite?: string;
  readonly prixUnitaire?: string;
  readonly tauxTVA?: string;
  readonly tvaCategorieId?: string;
}
export interface CommandeWriterForAgent {
  creer(ctx: TenantContext, input: { fournisseurId: number; notes?: string; lignes: readonly CommandeLigneInput[] }): Promise<{ id: number; numero: string; totalTTC: string }>;
}
export interface CommandeSenderForAgent {
  envoyer(ctx: TenantContext, commandeId: number, customMessage?: string): Promise<EnvoiResultForAgent>;
}

export interface AssistantWriteDeps {
  readonly clients?: ClientWriterForAgent;
  readonly clientsById?: ClientByIdReaderForAgent;
  readonly interventions?: InterventionWriterForAgent;
  readonly interventionUpdater?: InterventionUpdaterForAgent;
  readonly devis?: DevisWriterForAgent;
  readonly factures?: FactureWriterForAgent;
  readonly devisSender?: DevisSenderForAgent;
  readonly factureSender?: FactureSenderForAgent;
  readonly relanceSender?: RelanceSenderForAgent;
  readonly commandes?: CommandeWriterForAgent;
  readonly commandeSender?: CommandeSenderForAgent;
}

/** `creer_client` : crée un client (nom requis ; `type` archivé en notes, parité legacy). `{clientId,nom,message}`. */
function makeCreerClient(clients: ClientWriterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    const nom = typeof args?.nom === "string" ? args.nom : "";
    if (!nom.trim()) return { ok: false, error: "Le nom est requis" };
    const notesParts: string[] = [];
    if (args.type) notesParts.push(`Type : ${String(args.type)}`);
    try {
      const client = await clients.create(ctx, {
        nom,
        prenom: optStr(args.prenom),
        email: optStr(args.email),
        telephone: optStr(args.telephone),
        adresse: optStr(args.adresse),
        ville: optStr(args.ville),
        codePostal: optStr(args.codePostal),
        notes: notesParts.length > 0 ? notesParts.join(" — ") : undefined,
      });
      return {
        ok: true,
        data: { clientId: client.id, nom: client.nom, message: `Client ${client.prenom ? client.prenom + " " : ""}${client.nom} créé (ID ${client.id})` },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création du client") };
    }
  };
}

/*
 * `creer_intervention` : statut `planifiee` forcé ; adresse par défaut = adresse postale du client si
 * non fournie ; ownership client (404 si cross-tenant — `getById` renvoie null). Parité legacy.
 */
function makeCreerIntervention(clientsById: ClientByIdReaderForAgent, interventions: InterventionWriterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.clientId || !args?.titre || !args?.dateDebut || !args?.dateFin) {
      return { ok: false, error: "clientId, titre, dateDebut et dateFin sont requis" };
    }
    try {
      const client = await clientsById.getById(ctx, Number(args.clientId));
      if (!client) return { ok: false, error: "Client introuvable" };
      const dateDebut = new Date(String(args.dateDebut));
      const dateFin = new Date(String(args.dateFin));
      if (isNaN(dateDebut.getTime()) || isNaN(dateFin.getTime())) return { ok: false, error: "Format de date invalide (utiliser ISO 8601)" };

      const inputAdresse = typeof args.adresse === "string" ? args.adresse.trim() : "";
      const clientAdresse = [client.adresse, client.codePostal, client.ville]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0)
        .join(" ");
      const adresse = inputAdresse || clientAdresse || undefined;

      const intervention = await interventions.create(ctx, {
        clientId: Number(args.clientId),
        titre: String(args.titre),
        description: optStr(args.description),
        dateDebut,
        dateFin,
        adresse,
        statut: "planifiee",
      });

      const clientFullName = `${client.prenom || ""} ${client.nom || ""}`.trim() || `Client #${client.id}`;
      const dateLabel = dateDebut.toLocaleString("fr-FR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
      const heureFin = dateFin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return {
        ok: true,
        data: {
          interventionId: intervention.id,
          titre: intervention.titre,
          client: clientFullName,
          adresse: adresse || null,
          dateDebut: intervention.dateDebut,
          dateFin: intervention.dateFin,
          message: `Intervention « ${intervention.titre} » planifiée pour ${clientFullName}${adresse ? ` à ${adresse}` : ""} le ${dateLabel} (jusqu'à ${heureFin}). ID #${intervention.id}.`,
        },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création de l'intervention") };
    }
  };
}

/*
 * Orchestration de création d'un devis brouillon + lignes (montants recalculés par le repo), validité
 * `validiteDays` jours (défaut 30). Lève en cas d'erreur use-case (ownership client, etc.). Réutilisée
 * par `creer_devis` et `creer_et_envoyer_devis`. `null` si paramètres manquants.
 */
async function creerDevisOrchestration(
  devis: DevisWriterForAgent,
  ctx: TenantContext,
  args: Record<string, unknown>,
): Promise<{ devisId: number; numero: string; totalTTC: string; statut: string } | null> {
  const clientId = Number(args?.clientId);
  const objet = typeof args?.objet === "string" ? args.objet : "";
  const lignes = Array.isArray(args?.lignes) ? (args.lignes as unknown[]) : [];
  if (!clientId || !objet || lignes.length === 0) return null;
  const validity = Number.isFinite(Number(args.validiteDays)) && Number(args.validiteDays) > 0 ? Number(args.validiteDays) : 30;
  const dateValidite = new Date(Date.now() + validity * 86400000);
  const created = await devis.creer(ctx, { clientId, objet, notes: optStr(args.notes), dateValidite });
  for (const raw of lignes) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const catDevis: TvaCategorieId = l.tvaCategorieId && String(l.tvaCategorieId) in TVA_CATEGORIES_MAP
      ? (String(l.tvaCategorieId) as TvaCategorieId)
      : tauxStringToCategorie(String(l.tauxTVA ?? 20));
    await devis.ajouterLigne(ctx, created.id, {
      designation: String(l.designation ?? ""),
      quantite: String(Number(l.quantite) || 0),
      unite: optStr(l.unite) ?? "u",
      prixUnitaireHT: String(Number(l.prixUnitaireHT) || 0),
      tauxTVA: TVA_CATEGORIES_MAP[catDevis].taux,
      tvaCategorieId: catDevis,
    });
  }
  const full = await devis.getById(ctx, created.id);
  return { devisId: created.id, numero: full?.numero ?? "", totalTTC: full?.totalTTC ?? "0", statut: full?.statut ?? "brouillon" };
}

const PARAMS_DEVIS_MANQUANTS = "Paramètres manquants : clientId, objet et au moins une ligne sont requis";

/** `creer_devis` : crée un devis brouillon + ses lignes. Ownership client via le use-case migré. */
function makeCreerDevis(devis: DevisWriterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    try {
      const d = await creerDevisOrchestration(devis, ctx, args);
      if (!d) return { ok: false, error: PARAMS_DEVIS_MANQUANTS };
      return {
        ok: true,
        data: { devisId: d.devisId, numero: d.numero, totalTTC: d.totalTTC, statut: d.statut, message: `Devis ${d.numero} créé en brouillon (${parseFloat(d.totalTTC || "0").toFixed(2)} € TTC)` },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création du devis") };
    }
  };
}

/*
 * `creer_et_envoyer_devis` : crée le devis puis l'envoie (email `messageEmail`). Si l'envoi échoue,
 * le devis reste créé (message explicite, parité legacy).
 */
function makeCreerEtEnvoyerDevis(devis: DevisWriterForAgent, sender: DevisSenderForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    try {
      const d = await creerDevisOrchestration(devis, ctx, args);
      if (!d) return { ok: false, error: PARAMS_DEVIS_MANQUANTS };
      const sent = await sender.envoyer(ctx, d.devisId, optStr(args.messageEmail));
      if (!sent.success) return { ok: false, error: `Devis ${d.numero} créé mais email non envoyé : ${sent.message}` };
      return {
        ok: true,
        data: {
          devisId: d.devisId,
          numero: d.numero,
          totalTTC: d.totalTTC,
          message: `Devis ${d.numero} (${parseFloat(d.totalTTC || "0").toFixed(2)} €) créé et envoyé. ${sent.message}`,
        },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création/envoi du devis") };
    }
  };
}

/*
 * `creer_facture` : depuis un devis (conversion — devis ACCEPTÉ requis) OU depuis des lignes (clientId
 * + lignes). `objet` requis. Ownership client/devis assurés par les use-cases migrés (404 cross-tenant).
 */
function makeCreerFacture(facture: FactureWriterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    const objet = typeof args?.objet === "string" ? args.objet : "";
    if (!objet) return { ok: false, error: "objet est requis" };
    try {
      let factureId: number;
      if (args.devisId) {
        const created = await facture.convertirDevis(ctx, Number(args.devisId));
        factureId = created.id;
        const current = await facture.getById(ctx, factureId);
        if (current && objet !== current.objet) await facture.setObjet(ctx, factureId, objet);
      } else {
        const clientId = Number(args.clientId);
        const lignes = Array.isArray(args.lignes) ? (args.lignes as unknown[]) : [];
        if (!clientId) return { ok: false, error: "clientId ou devisId requis" };
        if (lignes.length === 0) return { ok: false, error: "Au moins une ligne est requise quand devisId n'est pas fourni" };
        const dateEcheance = new Date(Date.now() + 30 * 86400000);
        const created = await facture.creer(ctx, { clientId, objet, dateEcheance });
        factureId = created.id;
        for (const raw of lignes) {
          const l = (raw ?? {}) as Record<string, unknown>;
          const catFact: TvaCategorieId = l.tvaCategorieId && String(l.tvaCategorieId) in TVA_CATEGORIES_MAP
            ? (String(l.tvaCategorieId) as TvaCategorieId)
            : tauxStringToCategorie(String(l.tauxTVA ?? 20));
          await facture.ajouterLigne(ctx, factureId, {
            designation: String(l.designation ?? ""),
            quantite: String(Number(l.quantite) || 0),
            unite: optStr(l.unite) ?? "u",
            prixUnitaireHT: String(Number(l.prixUnitaireHT) || 0),
            tauxTVA: TVA_CATEGORIES_MAP[catFact].taux,
            tvaCategorieId: catFact,
          });
        }
      }
      const full = await facture.getById(ctx, factureId);
      const numero = full?.numero ?? "";
      const totalTTC = full?.totalTTC ?? "0";
      return {
        ok: true,
        data: {
          factureId,
          numero,
          totalTTC,
          statut: full?.statut ?? "brouillon",
          message: `Facture ${numero} créée (${parseFloat(totalTTC || "0").toFixed(2)} € TTC)`,
        },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création de la facture") };
    }
  };
}

/*
 * `envoyer_devis` / `envoyer_facture` : envoi par email (PDF joint) via le use-case migré ; ownership
 * 404 / email client requis / rate-limit captés en exception → `{ok:false}`. `{message}` en succès.
 */
function makeEnvoyerDevis(sender: DevisSenderForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.devisId) return { ok: false, error: "devisId est requis" };
    try {
      const result = await sender.envoyer(ctx, Number(args.devisId), optStr(args.messagePersonnalise));
      return result.success ? { ok: true, data: { message: result.message } } : { ok: false, error: result.message };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de l'envoi du devis") };
    }
  };
}
function makeEnvoyerFacture(sender: FactureSenderForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.factureId) return { ok: false, error: "factureId est requis" };
    try {
      const result = await sender.envoyer(ctx, Number(args.factureId), optStr(args.messagePersonnalise));
      return result.success ? { ok: true, data: { message: result.message } } : { ok: false, error: result.message };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de l'envoi de la facture") };
    }
  };
}

/** `envoyer_relance` : relance d'une facture impayée (use-case migré, sans PDF). factureId requis. */
function makeEnvoyerRelance(sender: RelanceSenderForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.factureId) return { ok: false, error: "factureId est requis" };
    try {
      const result = await sender.envoyer(ctx, Number(args.factureId), optStr(args.messagePersonnalise));
      return result.success ? { ok: true, data: { message: result.message } } : { ok: false, error: result.message };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de l'envoi de la relance") };
    }
  };
}

/*
 * `creer_commande_fournisseur` : crée un BC brouillon + lignes (totaux + ownership fournisseur par le
 * use-case migré). `delaiLivraison` (texte libre, sans champ migré dédié) est replié dans les notes.
 */
function makeCreerCommande(commandes: CommandeWriterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    const fournisseurId = Number(args?.fournisseurId);
    const lignes = Array.isArray(args?.lignes) ? (args.lignes as unknown[]) : [];
    if (!fournisseurId || lignes.length === 0) return { ok: false, error: "fournisseurId et au moins une ligne sont requis" };
    try {
      const delai = optStr(args.delaiLivraison);
      const baseNotes = optStr(args.notes);
      const notes = [baseNotes, delai ? `Délai : ${delai}` : undefined].filter(Boolean).join(" — ") || undefined;
      const commande = await commandes.creer(ctx, {
        fournisseurId,
        notes,
        lignes: lignes.map((raw) => {
          const l = (raw ?? {}) as Record<string, unknown>;
          const catCmd: TvaCategorieId = l.tvaCategorieId && String(l.tvaCategorieId) in TVA_CATEGORIES_MAP
            ? (String(l.tvaCategorieId) as TvaCategorieId)
            : tauxStringToCategorie(String(l.tauxTVA ?? 20));
          return {
            designation: String(l.designation ?? ""),
            quantite: String(Number(l.quantite) || 0),
            unite: optStr(l.unite) ?? "u",
            prixUnitaire: String(Number(l.prixUnitaireHT) || 0),
            tauxTVA: TVA_CATEGORIES_MAP[catCmd].taux,
            tvaCategorieId: catCmd,
          };
        }),
      });
      return {
        ok: true,
        data: {
          commandeId: commande.id,
          numero: commande.numero,
          totalTTC: commande.totalTTC,
          message: `Bon de commande ${commande.numero} créé en brouillon (${parseFloat(commande.totalTTC || "0").toFixed(2)} € TTC)`,
        },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la création de la commande") };
    }
  };
}

/** `envoyer_commande_fournisseur` : envoi par email (PDF joint) via le use-case migré. */
function makeEnvoyerCommande(sender: CommandeSenderForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.commandeId) return { ok: false, error: "commandeId est requis" };
    try {
      const result = await sender.envoyer(ctx, Number(args.commandeId), optStr(args.messagePersonnalise));
      return result.success ? { ok: true, data: { message: result.message } } : { ok: false, error: result.message };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de l'envoi de la commande") };
    }
  };
}

/*
 * `modifier_intervention` : met à jour les champs fournis (titre/dates/statut/notes). Ownership via le
 * use-case migré (404 cross-tenant). Dates ISO validées. `Aucun champ` → refus (parité legacy).
 */
function makeModifierIntervention(updater: InterventionUpdaterForAgent): ToolHandler {
  return async (args, ctx: TenantContext) => {
    if (!args?.interventionId) return { ok: false, error: "interventionId est requis" };
    const patch: { titre?: string; dateDebut?: Date; dateFin?: Date; statut?: string; notes?: string } = {};
    if (typeof args.titre === "string") patch.titre = args.titre;
    if (args.dateDebut != null) {
      const d = new Date(String(args.dateDebut));
      if (isNaN(d.getTime())) return { ok: false, error: "dateDebut invalide" };
      patch.dateDebut = d;
    }
    if (args.dateFin != null) {
      const d = new Date(String(args.dateFin));
      if (isNaN(d.getTime())) return { ok: false, error: "dateFin invalide" };
      patch.dateFin = d;
    }
    if (typeof args.statut === "string") patch.statut = args.statut;
    if (typeof args.notes === "string") patch.notes = args.notes;
    if (Object.keys(patch).length === 0) return { ok: false, error: "Aucun champ à modifier" };
    try {
      const updated = await updater.modifier(ctx, Number(args.interventionId), patch);
      return {
        ok: true,
        data: { interventionId: updated.id, titre: updated.titre, statut: updated.statut, message: `Intervention #${Number(args.interventionId)} mise à jour` },
      };
    } catch (e) {
      /* ponytail: best-effort — erreur retournée au caller via { ok: false } */
      return { ok: false, error: errMsg(e, "Erreur lors de la mise à jour de l'intervention") };
    }
  };
}

/*
 * Construit les handlers d'écriture câblés (par lots, risque croissant). Un outil n'est inclus que si
 * ses readers/writers sont fournis. 2a : creer_client/intervention ; 2b : creer_devis ; 2c : creer_facture ;
 * 2d : envoyer_devis/envoyer_facture ; 2e : creer_et_envoyer_devis + commandes ; 2f : modifier_intervention.
 */
export function buildAssistantWriteHandlers(deps: AssistantWriteDeps): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};
  if (deps.clients) handlers.creer_client = makeCreerClient(deps.clients);
  if (deps.clientsById && deps.interventions) handlers.creer_intervention = makeCreerIntervention(deps.clientsById, deps.interventions);
  if (deps.interventionUpdater) handlers.modifier_intervention = makeModifierIntervention(deps.interventionUpdater);
  if (deps.devis) handlers.creer_devis = makeCreerDevis(deps.devis);
  if (deps.devis && deps.devisSender) handlers.creer_et_envoyer_devis = makeCreerEtEnvoyerDevis(deps.devis, deps.devisSender);
  if (deps.factures) handlers.creer_facture = makeCreerFacture(deps.factures);
  if (deps.devisSender) handlers.envoyer_devis = makeEnvoyerDevis(deps.devisSender);
  if (deps.factureSender) handlers.envoyer_facture = makeEnvoyerFacture(deps.factureSender);
  if (deps.relanceSender) handlers.envoyer_relance = makeEnvoyerRelance(deps.relanceSender);
  if (deps.commandes) handlers.creer_commande_fournisseur = makeCreerCommande(deps.commandes);
  if (deps.commandeSender) handlers.envoyer_commande_fournisseur = makeEnvoyerCommande(deps.commandeSender);
  return handlers;
}
