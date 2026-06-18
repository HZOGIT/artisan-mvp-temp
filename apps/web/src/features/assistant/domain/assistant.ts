import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `assistant` (chat IA streaming + actions rapides + voix/dictée). Le flux SSE
// `/api/assistant/stream` n'est PAS tRPC → on type/parse ses événements à la main (avec gardes runtime,
// 0 `any`). Constructeurs markdown des actions rapides = purs et testables.

export type Message = { role: "user" | "assistant"; content: string };

export type Devis = RouterOutputs["devis"]["list"][number];

// Le backend type `generateDevis.lignes` et `suggestRelances` en `unknown` → on déclare la forme connue
// ici et l'application caste à la frontière (assertion typée, pas de `any`).
export type DevisLigne = { designation: string; quantite: number; unite: string; prixUnitaireHT: number; tauxTVA: number };
export type RelanceItem = { numero: string; objet?: string | null; email?: { sujet: string; corps: string } | null };
export type Relances = RelanceItem[] | { suggestions: string } | string;

// Événement décodé d'une trame SSE de l'assistant.
export type StreamEvent = {
  content?: string;
  threadId?: number;
  error?: string;
  navigate?: string;
  filtre?: string;
  invalidate?: string[];
  toolStart?: { name: string; args: Record<string, unknown> };
  toolEnd?: { name: string; ok: boolean; error?: string };
};

// Parse une charge utile `data:` (déjà privée du préfixe). `"done"` pour [DONE], `null` si JSON invalide. PUR.
export function parseStreamData(data: string): StreamEvent | "done" | null {
  if (data === "[DONE]") return "done";
  let p: Record<string, unknown>;
  try { p = JSON.parse(data) as Record<string, unknown>; } catch { return null; }
  const ev: StreamEvent = {};
  if (typeof p.content === "string") ev.content = p.content;
  if (typeof p.threadId === "number") ev.threadId = p.threadId;
  if (typeof p.error === "string") ev.error = p.error;
  if (typeof p.navigate === "string" && p.navigate.length > 0) ev.navigate = p.navigate;
  if (typeof p.filtre === "string") ev.filtre = p.filtre;
  if (Array.isArray(p.invalidate)) ev.invalidate = p.invalidate.filter((k): k is string => typeof k === "string");
  if (p.toolStart && typeof p.toolStart === "object") {
    const ts = p.toolStart as Record<string, unknown>;
    if (typeof ts.name === "string") ev.toolStart = { name: ts.name, args: (ts.args as Record<string, unknown>) ?? {} };
  }
  if (p.toolEnd && typeof p.toolEnd === "object") {
    const te = p.toolEnd as Record<string, unknown>;
    if (typeof te.name === "string") ev.toolEnd = { name: te.name, ok: te.ok === true, error: typeof te.error === "string" ? te.error : undefined };
  }
  return ev;
}

// Découpe un flux SSE accumulé en (lignes complètes, reste tamponné). PUR.
export function splitSseBuffer(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  return { rest: parts.pop() || "", lines: parts };
}

// Extrait la charge utile d'une ligne SSE `data: …`, sinon null. PUR.
export function sseDataLine(line: string): string | null {
  return line.startsWith("data: ") ? line.slice(6) : null;
}

// Historique transmis au backend : N derniers messages (rôle + contenu). PUR.
export function sliceHistory(messages: readonly Message[], n = 10): Message[] {
  return messages.slice(-n).map((m) => ({ role: m.role, content: m.content }));
}

// URL de navigation déclenchée par un outil de l'assistant (avec filtre optionnel). PUR.
export function navigateTarget(navigate: string, filtre?: string): string {
  return filtre ? `${navigate}?filtre=${encodeURIComponent(filtre)}` : navigate;
}

// Markdown d'un devis suggéré (tableau des lignes + total HT). PUR.
export function buildDevisMarkdown(description: string, lignes: readonly DevisLigne[]): string {
  let content = `**Devis suggéré pour : ${description}**\n\n`;
  content += `| Désignation | Qté | Unité | Prix HT | TVA |\n|---|---|---|---|---|\n`;
  for (const l of lignes) {
    content += `| ${l.designation} | ${l.quantite} | ${l.unite} | ${l.prixUnitaireHT.toFixed(2)} | ${l.tauxTVA}% |\n`;
  }
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
  content += `\n**Total HT : ${total.toFixed(2)} EUR**`;
  return content;
}

// Markdown des suggestions de relance (gère tableau / {suggestions} / chaîne). PUR.
export function buildRelancesMarkdown(relances: Relances): string {
  if (Array.isArray(relances)) {
    if (relances.length === 0) return "**Suggestions de relance**\n\nAucun devis en attente de relance.";
    let content = "**Suggestions de relance**\n\n";
    for (const r of relances) {
      content += `**${r.numero}** - ${r.objet || "Sans objet"}\n`;
      if (r.email) { content += `*Sujet :* ${r.email.sujet}\n${r.email.corps}\n\n---\n\n`; }
    }
    return content;
  }
  if (typeof relances === "string") return relances;
  if (relances && typeof relances === "object" && "suggestions" in relances && typeof relances.suggestions === "string") return relances.suggestions;
  return "**Suggestions de relance**\n\n";
}
