import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid,
  Lock, MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart,
  Sparkles, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICON_MAP: Record<string, LucideIcon> = {
  Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid,
  MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart, Sparkles,
  Users, Wrench,
};

type Categorie = "commercial" | "clients" | "terrain" | "gestion" | "ia" | "parametres";
type Plan = "essentiel" | "pro" | "entreprise";

const CATEGORIE_META: Record<Categorie, { label: string; gradient: string }> = {
  commercial: { label: "Commercial", gradient: "from-blue-500 to-indigo-600" },
  clients: { label: "Clients", gradient: "from-orange-500 to-amber-600" },
  terrain: { label: "Terrain", gradient: "from-rose-500 to-red-600" },
  gestion: { label: "Gestion", gradient: "from-cyan-500 to-teal-600" },
  ia: { label: "IA", gradient: "from-violet-500 to-purple-600" },
  parametres: { label: "Paramètres", gradient: "from-slate-500 to-slate-600" },
};

const PLAN_META: Record<Plan, { label: string; bg: string; text: string }> = {
  essentiel: { label: "Essentiel", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" },
  pro: { label: "Pro", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  entreprise: { label: "Entreprise", bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
};

type ModuleRow = {
  id: number; slug: string; label: string; description: string | null;
  icon: string; categorie: Categorie; planMinimum: Plan;
  actifParDefaut: boolean; ordre: number; actif: boolean; locked: boolean;
};

export default function ModulesPage() {
  const utils = trpc.useUtils();
  const { data: modules, isLoading } = trpc.modules.list.useQuery();
  const [filter, setFilter] = useState<Categorie | "all">("all");

  const toggleMutation = trpc.modules.toggle.useMutation({
    onSuccess: () => {
      utils.modules.list.invalidate();
      utils.modules.getMine.invalidate();
    },
    onError: (err) => toast.error(err.message || "Impossible de modifier ce module"),
  });

  const list = (modules || []) as ModuleRow[];
  const filtered = useMemo(
    () => (filter === "all" ? list : list.filter((m) => m.categorie === filter)),
    [list, filter]
  );

  const counts = useMemo(() => ({
    actifs: list.filter((m) => m.actif).length,
    total: list.length,
  }), [list]);

  const handleToggle = (m: ModuleRow, next: boolean) => {
    if (m.locked) return;
    toggleMutation.mutate({ slug: m.slug, actif: next });
    toast.success(next ? `Module « ${m.label} » activé` : `Module « ${m.label} » désactivé`);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Mes modules</h1>
        <p className="text-muted-foreground mt-1">
          Activez les fonctionnalités dont vous avez besoin.{" "}
          <span className="text-foreground font-medium">{counts.actifs}</span> sur {counts.total} actifs.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Tous ({counts.total})
        </button>
        {(Object.keys(CATEGORIE_META) as Categorie[]).map((cat) => {
          const n = list.filter((m) => m.categorie === cat).length;
          if (n === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {CATEGORIE_META[cat].label} ({n})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m, i) => {
            const Icon = ICON_MAP[m.icon] || LayoutGrid;
            const cat = CATEGORIE_META[m.categorie];
            const plan = PLAN_META[m.planMinimum];
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className={`relative bg-card text-card-foreground rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow ${
                  m.locked ? "opacity-75" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`relative h-14 w-14 rounded-2xl bg-gradient-to-br ${cat.gradient} text-white inline-flex items-center justify-center shadow-md`}>
                    <Icon className="h-7 w-7" />
                    {m.locked && (
                      <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border border-border inline-flex items-center justify-center shadow-sm">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  {m.locked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span><Switch checked={false} disabled aria-label="Module verrouillé" /></span>
                      </TooltipTrigger>
                      <TooltipContent>Disponible à partir du plan {plan.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Switch
                      checked={m.actif}
                      onCheckedChange={(checked) => handleToggle(m, checked)}
                      aria-label={`Activer ${m.label}`}
                    />
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-base font-semibold tracking-tight">{m.label}</h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${plan.bg} ${plan.text}`}>
                      {plan.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{m.description || ""}</p>
                </div>

                {m.locked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => toast.info("Fonctionnalité à venir : changement de plan")}
                  >
                    Passer au {plan.label} →
                  </Button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
