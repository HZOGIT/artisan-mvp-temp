import type { TenantContext } from "../../../shared/tenant";
import type { ToolHandler } from "./assistant-tool-registry";

// Handlers d'ÉCRITURE de l'assistant agentique (Phase 2, opt-in). Chaque écriture est mappée à un
// use-case DÉJÀ MIGRÉ du domaine (anti-IDOR ownership, validation, jamais de SQL brut) ; on formate
// le `data` à la **forme legacy** + on capture les exceptions (parité legacy `try/catch → fail`).
// Phase 2a : `creer_client` + `creer_intervention` (les moins risquées).

const optStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const errMsg = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

// ── Ports d'écriture (satisfaits par les use-cases migrés via un petit adapter au câblage) ──────
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

export interface AssistantWriteDeps {
  readonly clients?: ClientWriterForAgent;
  readonly clientsById?: ClientByIdReaderForAgent;
  readonly interventions?: InterventionWriterForAgent;
}

// `creer_client` : crée un client (nom requis ; `type` archivé en notes, parité legacy). `{clientId,nom,message}`.
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
      return { ok: false, error: errMsg(e, "Erreur lors de la création du client") };
    }
  };
}

// `creer_intervention` : statut `planifiee` forcé ; adresse par défaut = adresse postale du client si
// non fournie ; ownership client (404 si cross-tenant — `getById` renvoie null). Parité legacy.
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
      return { ok: false, error: errMsg(e, "Erreur lors de la création de l'intervention") };
    }
  };
}

// Construit les handlers d'écriture câblés (Phase 2a : creer_client + creer_intervention). Un outil
// n'est inclus que si ses readers/writers sont fournis.
export function buildAssistantWriteHandlers(deps: AssistantWriteDeps): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};
  if (deps.clients) handlers.creer_client = makeCreerClient(deps.clients);
  if (deps.clientsById && deps.interventions) handlers.creer_intervention = makeCreerIntervention(deps.clientsById, deps.interventions);
  return handlers;
}
