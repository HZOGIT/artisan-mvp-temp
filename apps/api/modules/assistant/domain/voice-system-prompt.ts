import type { ToolSchema } from "./assistant-tools-catalog";

export interface VoiceHistoryMessage {
  readonly role: string;
  readonly transcript: string;
}

// Instruction système de la session vocale Live (parité legacy `/api/voice/token`) : prompt métier de
// base + historique récent + liste des outils appelables + RÈGLES STRICTES (appeler réellement les
// fonctions, ne rien inventer). PUR. Le setup Live déclare AUSSI les outils (`function_declarations`) ;
// les lister dans le prompt empêche le modèle de « réciter » un appel au lieu de l'exécuter.
export function buildVoiceSystemInstruction(input: { baseSystem: string; history: readonly VoiceHistoryMessage[]; tools: readonly ToolSchema[] }): string {
  let text = input.baseSystem;

  if (input.history.length > 0) {
    const histLines = input.history.map((m) => `${m.role === "assistant" ? "Assistant" : "Artisan"}: ${m.transcript}`).join("\n");
    text += `\n\n--- Historique récent de la conversation ---\n${histLines}`;
  }

  const toolList = input.tools.map((t) => `- ${t.name} : ${t.description}`).join("\n");
  text += `\n\n--- OUTILS DISPONIBLES (fonctions que tu peux APPELER) ---
${toolList}

RÈGLES STRICTES sur les outils :
- Quand une demande nécessite une de ces actions, APPELLE réellement la fonction correspondante. N'écris/ne prononce JAMAIS "Tool call:" ou le nom de la fonction en texte.
- N'invente JAMAIS un résultat, un client, un devis, un montant ou une donnée. Ne prétends pas avoir fait une action sans appeler l'outil.
- N'annonce pas "je cherche" / "un instant" pour ensuite attendre : appelle l'outil immédiatement, son résultat te reviendra et tu répondras ensuite.
- Si AUCUNE fonction ne couvre la demande, dis-le franchement plutôt que d'inventer, et propose éventuellement de repasser en mode texte.`;

  return text;
}
