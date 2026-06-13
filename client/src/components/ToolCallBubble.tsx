import { Wrench, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/hooks/useAssistantStream";

const TOOL_LABELS: Record<string, string> = {
  chercher_client: "Recherche client",
  creer_devis: "Création devis",
  envoyer_devis: "Envoi devis",
  creer_et_envoyer_devis: "Création et envoi devis",
  creer_facture: "Création facture",
  envoyer_facture: "Envoi facture",
  envoyer_relance: "Relance",
  creer_intervention: "Création intervention",
  lister_factures_impayees: "Factures impayées",
  lister_devis_en_attente: "Devis en attente",
  verifier_stocks: "Vérification stocks",
  creer_commande_fournisseur: "Commande fournisseur",
  envoyer_commande_fournisseur: "Envoi commande",
  lister_clients: "Liste clients",
  creer_client: "Création client",
  get_statistiques: "Statistiques",
  lister_fournisseurs: "Liste fournisseurs",
  chercher_fournisseur: "Recherche fournisseur",
  lister_interventions: "Liste interventions",
  modifier_intervention: "Modification intervention",
  naviguer_vers: "Navigation",
};

function argsPreview(args: Record<string, any>): string {
  const entries = Object.entries(args).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const vStr = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}: ${vStr.length > 40 ? vStr.slice(0, 40) + "…" : vStr}`;
    })
    .join(" · ");
}

export function ToolCallBubble({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name.replace(/_/g, " ");
  const preview = argsPreview(toolCall.args);
  const hasArgs = preview.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 my-1 w-fit max-w-full",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
          toolCall.status === "running" &&
            "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
          toolCall.status === "ok" &&
            "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300",
          toolCall.status === "error" &&
            "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
        )}
      >
        <Wrench className="size-3 shrink-0 opacity-70" />
        <span>{label}</span>
        {toolCall.status === "running" && (
          <Loader2 className="size-3 animate-spin shrink-0" />
        )}
        {toolCall.status === "ok" && (
          <CheckCircle className="size-3 shrink-0" />
        )}
        {toolCall.status === "error" && (
          <XCircle className="size-3 shrink-0" />
        )}
        {hasArgs && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
            aria-label={expanded ? "Masquer les détails" : "Voir les détails"}
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform duration-150",
                expanded && "rotate-180"
              )}
            />
          </button>
        )}
      </div>
      {expanded && hasArgs && (
        <p className="font-mono text-[10px] text-muted-foreground px-2.5 leading-relaxed">
          {preview}
        </p>
      )}
      {toolCall.status === "error" && toolCall.error && (
        <p className="text-[10px] text-red-500 px-2.5">{toolCall.error}</p>
      )}
    </div>
  );
}
