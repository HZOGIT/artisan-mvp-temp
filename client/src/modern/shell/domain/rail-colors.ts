import type { NavColor } from "./nav";

// Map couleur de groupe → classes Tailwind du rail de la sidebar. PORT FIDÈLE de RAIL_COLORS (DashboardLayout).
// Inclut bien 'purple' (groupe Finance) : son absence faisait planter tout le shell (RAIL_COLORS['purple'] undefined).
export const RAIL_COLORS: Record<NavColor, { iconActive: string; bgActive: string; ring: string; hover: string }> = {
  violet: { iconActive: "text-violet-500", bgActive: "bg-violet-100 dark:bg-violet-900/30", ring: "ring-violet-500/30", hover: "hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20" },
  blue: { iconActive: "text-blue-500", bgActive: "bg-blue-100 dark:bg-blue-900/30", ring: "ring-blue-500/30", hover: "hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20" },
  emerald: { iconActive: "text-emerald-500", bgActive: "bg-emerald-100 dark:bg-emerald-900/30", ring: "ring-emerald-500/30", hover: "hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" },
  orange: { iconActive: "text-orange-500", bgActive: "bg-orange-100 dark:bg-orange-900/30", ring: "ring-orange-500/30", hover: "hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20" },
  rose: { iconActive: "text-rose-500", bgActive: "bg-rose-100 dark:bg-rose-900/30", ring: "ring-rose-500/30", hover: "hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20" },
  cyan: { iconActive: "text-cyan-500", bgActive: "bg-cyan-100 dark:bg-cyan-900/30", ring: "ring-cyan-500/30", hover: "hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20" },
  slate: { iconActive: "text-slate-700 dark:text-slate-300", bgActive: "bg-slate-100 dark:bg-slate-800", ring: "ring-slate-500/30", hover: "hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" },
  purple: { iconActive: "text-purple-500", bgActive: "bg-purple-100 dark:bg-purple-900/30", ring: "ring-purple-500/30", hover: "hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20" },
};
