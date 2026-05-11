import * as db from "../db";

// Memory cache for artisan context, 60s TTL.
// Single-instance cache (Railway hobby plan = 1 replica). If we scale out,
// switch to Redis or rely on tRPC query cache on the client.
const CACHE_TTL_MS = 60_000;

interface ArtisanContext {
  artisan: Awaited<ReturnType<typeof db.getArtisanById>>;
  stats: Awaited<ReturnType<typeof db.getDashboardStats>>;
  recentClients: string;
  devisNonSignes: number;
  interventionsSemaine: number;
  stocksBas: number;
  contratsARenouveler: number;
}

const cache = new Map<number, { data: ArtisanContext; expiresAt: number }>();

async function fetchArtisanContext(artisanId: number): Promise<ArtisanContext> {
  const [artisan, stats, clientsList, devisNonSignes, interventionsList, stocksBas, contrats] =
    await Promise.all([
      db.getArtisanById(artisanId),
      db.getDashboardStats(artisanId),
      db.getClientsByArtisanId(artisanId),
      db.getDevisNonSignes(artisanId),
      db.getInterventionsByArtisanId(artisanId),
      db.getLowStockItems(artisanId),
      db.getContratsByArtisanId(artisanId),
    ]);

  const recentClients = clientsList
    .slice(0, 5)
    .map((c: any) => `${c.prenom || ""} ${c.nom}`.trim())
    .join(", ");

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);

  const interventionsSemaine = interventionsList.filter((i: any) => {
    const d = new Date(i.dateDebut);
    return d >= now && d <= weekFromNow && i.statut === "planifiee";
  }).length;

  const contratsARenouveler = contrats.filter((c: any) => {
    if (!c.dateFin) return false;
    const fin = new Date(c.dateFin);
    return fin <= weekFromNow && c.statut === "actif";
  }).length;

  return {
    artisan,
    stats,
    recentClients,
    devisNonSignes: devisNonSignes.length,
    interventionsSemaine,
    stocksBas: stocksBas.length,
    contratsARenouveler,
  };
}

async function getArtisanContext(artisanId: number): Promise<ArtisanContext> {
  const cached = cache.get(artisanId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchArtisanContext(artisanId);
  cache.set(artisanId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export function invalidateArtisanContextCache(artisanId?: number): void {
  if (artisanId !== undefined) cache.delete(artisanId);
  else cache.clear();
}

export interface SystemPromptOptions {
  pageContext?: string;
}

/**
 * Builds the MonAssistant system prompt with the artisan's live data.
 * Used by both the SSE chat route (/api/assistant/stream) and the
 * one-shot quick actions in routers.ts to keep them in sync.
 *
 * Data is cached per artisan for 60s to avoid 8 DB queries on every
 * single chat turn.
 */
export async function buildSystemPrompt(
  artisanId: number,
  options: SystemPromptOptions = {}
): Promise<string> {
  const {
    artisan,
    stats,
    recentClients,
    devisNonSignes,
    interventionsSemaine,
    stocksBas,
    contratsARenouveler,
  } = await getArtisanContext(artisanId);

  const pageContextBlock = options.pageContext
    ? `\nContexte actuel : ${options.pageContext}\n`
    : "";

  return `Tu es MonAssistant, l'assistant IA de Operioz. Tu aides l'artisan ${artisan?.nomEntreprise || "Artisan"} (${(artisan as any)?.metier || "artisan"}) dans sa gestion quotidienne.
${pageContextBlock}
Tu as accès aux données suivantes :
- ${stats.devisEnCours} devis en attente de réponse
- ${stats.facturesImpayees.count} factures impayées pour un total de ${stats.facturesImpayees.total.toFixed(2)} euros
- CA du mois : ${stats.caMonth.toFixed(2)} euros
- CA de l'année : ${stats.caYear.toFixed(2)} euros
- ${interventionsSemaine} interventions cette semaine
- ${stocksBas} articles en stock bas
- ${devisNonSignes} devis envoyés en attente de signature
- ${contratsARenouveler} contrats à renouveler prochainement
- ${stats.totalClients} clients au total
- Clients récents : ${recentClients || "aucun"}
- SIRET : ${artisan?.siret || "non renseigné"}

Tu peux répondre aux questions sur l'activité, générer des lignes de devis, suggérer des emails de relance, analyser la rentabilité, prédire la trésorerie, donner des conseils de gestion.
Réponds toujours en français, de manière concise et professionnelle. Utilise le tutoiement.
Utilise le markdown pour formater tes réponses (listes, gras, tableaux si nécessaire).`;
}
