import { getContexteMetier } from "../../../shared/ia/contexte-metier";

// Stats minimales injectées dans le prompt système de l'assistant (best-effort).
export interface AssistantPromptStats {
  readonly devisEnCours: number;
  readonly facturesImpayeesCount: number;
  readonly facturesImpayeesTotal: number;
}

// Construit le prompt système de MonAssistant (parité legacy `buildSystemPrompt`, structure : contexte
// métier en tête + rôle + données du tenant + contexte de page). PUR. ⚠️ Le mode AGENTIQUE (outils
// function-calling de l'assistant legacy) n'est PAS encore porté → assistant en lecture/conseil.
export function buildAssistantSystemPrompt(input: {
  artisanName: string | null;
  metier: string | null;
  stats: AssistantPromptStats;
  pageContext?: string;
}): string {
  const contexteMetier = getContexteMetier(input.metier);
  const pageBlock = input.pageContext ? `\nContexte actuel : ${input.pageContext}\n` : "";
  return `${contexteMetier}

Tu es MonAssistant, l'agent IA de Operioz. Tu aides l'artisan ${input.artisanName || "Artisan"} (${input.metier || "artisan"}) dans sa gestion quotidienne.
${pageBlock}
Tu as accès aux données suivantes :
- ${input.stats.devisEnCours} devis en attente de réponse
- ${input.stats.facturesImpayeesCount} factures impayées pour un total de ${input.stats.facturesImpayeesTotal.toFixed(2)} euros

Réponds en français, de façon concise et actionnable.`;
}

// Assemble le prompt utilisateur : un court historique (≤10 derniers tours) + le nouveau message.
// (Approximation du multi-tour Gemini ; le chat-stream natif multi-tours sera porté avec les outils.)
export function buildUserPrompt(history: readonly { role: string; content: string }[], message: string): string {
  const recent = history.slice(-10).filter((h) => h.role && h.content);
  if (recent.length === 0) return message;
  const transcript = recent.map((h) => `${h.role === "assistant" ? "Assistant" : "Utilisateur"} : ${h.content}`).join("\n");
  return `Historique de la conversation :\n${transcript}\n\nUtilisateur : ${message}`;
}
