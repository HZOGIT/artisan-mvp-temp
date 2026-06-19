import type { LucideIcon } from "lucide-react";
import { CheckCircle, AlertTriangle, Clock, Info, XCircle } from "lucide-react";

/** Map type de notification → icône + couleur. PORT FIDÈLE de DashboardLayout. PUR. */
const ICONS: Record<string, LucideIcon> = { succes: CheckCircle, alerte: AlertTriangle, rappel: Clock, info: Info, erreur: XCircle };
const COLORS: Record<string, string> = { succes: "text-green-500", alerte: "text-orange-500", rappel: "text-blue-500", info: "text-sky-500", erreur: "text-red-500" };

export function notifTypeMeta(type: string): { Icon: LucideIcon; color: string } {
  return { Icon: ICONS[type] ?? Info, color: COLORS[type] ?? "text-muted-foreground" };
}
