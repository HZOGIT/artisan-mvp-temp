import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Target } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

const formatEUR = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

interface ProgressRowProps {
  label: string;
  current: number;
  target: number;
  format?: (v: number) => string;
  delay?: number;
}

function ProgressRow({ label, current, target, format, delay = 0 }: ProgressRowProps) {
  const fmt = format || ((v) => v.toString());
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  // La barre passe au vert quand on dépasse 80 %.
  const isGreen = pct >= 80;
  const barColor = isGreen ? "bg-emerald-500" : "bg-blue-500";

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {fmt(current)} / {fmt(target)}
          <span className={`ml-2 font-semibold ${isGreen ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
            {pct}%
          </span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, delay, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
    </div>
  );
}

export function ObjectifsWidget() {
  const { data, isLoading } = trpc.dashboard.getObjectifs.useQuery();

  if (isLoading) return <WidgetSkeleton height={200} lines={4} />;

  const o = data || {
    objectifCA: 0,
    currentCA: 0,
    objectifDevis: 0,
    currentDevis: 0,
    objectifClients: 0,
    currentClients: 0,
  };

  const noObjectives =
    !o.objectifCA && !o.objectifDevis && !o.objectifClients;

  if (noObjectives) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
        <Target className="h-8 w-8 opacity-30" />
        <p className="text-sm text-center">
          Aucun objectif défini.<br />
          <span className="text-xs">Configurez vos objectifs dans Paramètres.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {o.objectifCA > 0 && (
        <ProgressRow
          label="Chiffre d'affaires"
          current={o.currentCA}
          target={o.objectifCA}
          format={formatEUR}
          delay={0}
        />
      )}
      {o.objectifDevis > 0 && (
        <ProgressRow
          label="Devis créés"
          current={o.currentDevis}
          target={o.objectifDevis}
          delay={0.1}
        />
      )}
      {o.objectifClients > 0 && (
        <ProgressRow
          label="Nouveaux clients"
          current={o.currentClients}
          target={o.objectifClients}
          delay={0.2}
        />
      )}
    </div>
  );
}
