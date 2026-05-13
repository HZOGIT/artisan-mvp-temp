import { motion } from "framer-motion";
import { Calendar, FileText, Receipt, type LucideIcon, Users } from "lucide-react";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  color: "blue" | "green" | "violet" | "orange";
  onClick: () => void;
}

interface QuickActionsProps {
  onNewDevis?: () => void;
  onNewFacture?: () => void;
  onNewClient?: () => void;
  onNewIntervention?: () => void;
}

const COLOR_CLASSES: Record<QuickAction["color"], { from: string; to: string; ring: string }> = {
  blue: { from: "from-blue-500", to: "to-blue-600", ring: "hover:ring-blue-300" },
  green: { from: "from-emerald-500", to: "to-emerald-600", ring: "hover:ring-emerald-300" },
  violet: { from: "from-violet-500", to: "to-violet-600", ring: "hover:ring-violet-300" },
  orange: { from: "from-orange-500", to: "to-orange-600", ring: "hover:ring-orange-300" },
};

export function QuickActions({
  onNewDevis,
  onNewFacture,
  onNewClient,
  onNewIntervention,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    onNewDevis && { label: "Nouveau devis", icon: FileText, color: "blue", onClick: onNewDevis },
    onNewFacture && { label: "Nouvelle facture", icon: Receipt, color: "green", onClick: onNewFacture },
    onNewClient && { label: "Nouveau client", icon: Users, color: "violet", onClick: onNewClient },
    onNewIntervention && { label: "Nouvelle intervention", icon: Calendar, color: "orange", onClick: onNewIntervention },
  ].filter(Boolean) as QuickAction[];

  if (actions.length === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {actions.map((action, index) => {
        const Icon = action.icon;
        const classes = COLOR_CLASSES[action.color];
        return (
          <motion.button
            key={action.label}
            type="button"
            onClick={action.onClick}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3 }}
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`group relative flex items-center gap-3 rounded-xl bg-gradient-to-br ${classes.from} ${classes.to} text-white p-4 shadow-md hover:shadow-lg transition-shadow ring-2 ring-transparent ${classes.ring}`}
          >
            <span className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-left flex-1">{action.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
