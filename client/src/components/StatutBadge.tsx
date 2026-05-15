import { Check, Clock, FileText, Send, AlertTriangle, Ban, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatutMeta = {
  label: string;
  className: string;
  icon?: LucideIcon;
  pulse?: boolean;
};

// Carte centrale des statuts metier de l'app. Les codes correspondent aux
// enums MySQL (drizzle/schema.ts). Les couleurs sont alignees sur les regles
// produit : brouillon gris, envoye bleu, accepte/payee vert, refuse rouge,
// en_retard rouge pulsant, expire orange, etc.
const STATUT_MAP: Record<string, StatutMeta> = {
  // Devis
  brouillon: {
    label: "Brouillon",
    className: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700",
    icon: FileText,
  },
  envoye: {
    label: "Envoyé",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: Send,
  },
  envoyee: {
    label: "Envoyée",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: Send,
  },
  accepte: {
    label: "Accepté",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  acceptee: {
    label: "Acceptée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  refuse: {
    label: "Refusé",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    icon: Ban,
  },
  refusee: {
    label: "Refusée",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    icon: Ban,
  },
  expire: {
    label: "Expiré",
    className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    icon: Clock,
  },
  // Factures
  validee: {
    label: "Validée",
    className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    icon: Check,
  },
  payee: {
    label: "Payée",
    className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
    icon: Check,
  },
  paye: {
    label: "Payé",
    className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
    icon: Check,
  },
  en_retard: {
    label: "En retard",
    className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
    icon: AlertTriangle,
    pulse: true,
  },
  annulee: {
    label: "Annulée",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 line-through dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700",
    icon: Ban,
  },
  annule: {
    label: "Annulé",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 line-through dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700",
    icon: Ban,
  },
  // Interventions / chantiers
  planifiee: {
    label: "Planifiée",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
    icon: Clock,
  },
  planifie: {
    label: "Planifié",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
    icon: Clock,
  },
  en_cours: {
    label: "En cours",
    className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  },
  en_pause: {
    label: "En pause",
    className: "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900",
  },
  terminee: {
    label: "Terminée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  termine: {
    label: "Terminé",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  effectuee: {
    label: "Effectuée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  // Commandes fournisseurs
  confirmee: {
    label: "Confirmée",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: Check,
  },
  livree: {
    label: "Livrée",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: Check,
  },
  // Etats genriques
  en_attente: {
    label: "En attente",
    className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    icon: Clock,
  },
  actif: {
    label: "Actif",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  },
  inactif: {
    label: "Inactif",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700",
  },
  suspendu: {
    label: "Suspendu",
    className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  },
};

export interface StatutBadgeProps {
  statut: string | null | undefined;
  size?: "sm" | "md";
  withIcon?: boolean;
  className?: string;
  // Label personnalise si on veut surcharger (ex : "Brouillons" au pluriel
  // dans un filtre). Par defaut on prend STATUT_MAP[statut].label.
  label?: string;
}

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1 [&>svg]:size-3",
  md: "text-xs px-2 py-0.5 gap-1.5 [&>svg]:size-3.5",
} as const;

export function StatutBadge({ statut, size = "md", withIcon = true, className, label }: StatutBadgeProps) {
  const key = (statut || "").toLowerCase().trim();
  const meta = STATUT_MAP[key];

  if (!meta) {
    // Fallback discret pour les statuts non mappes : on affiche le code brut
    // au lieu de planter visuellement.
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border font-medium whitespace-nowrap",
          "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700",
          SIZE_CLASSES[size],
          className,
        )}
      >
        {label || statut || "—"}
      </span>
    );
  }

  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium whitespace-nowrap",
        meta.className,
        SIZE_CLASSES[size],
        meta.pulse && "animate-pulse",
        className,
      )}
      title={label || meta.label}
    >
      {withIcon && Icon ? <Icon aria-hidden /> : null}
      <span>{label || meta.label}</span>
    </span>
  );
}

// Helper pour ceux qui veulent juste le label sans le badge (ex : tooltip).
export function statutLabel(statut: string | null | undefined): string {
  if (!statut) return "—";
  const meta = STATUT_MAP[statut.toLowerCase().trim()];
  return meta?.label || statut;
}
