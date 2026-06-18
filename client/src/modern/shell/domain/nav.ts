import type { LucideIcon } from "lucide-react";
import {
  Sparkles, History, ScanLine, LayoutDashboard, LineChart, FileText, Layers, Receipt, ClipboardList,
  RefreshCw, Users, Upload, Star, Globe, MessageCircle, Clock, Calendar, CalendarDays, Wrench, MapPin,
  HardHat, Route, Truck, Car, Package, Boxes, ShoppingCart, Building2, Calculator, Bell, CalendarOff,
  Trophy, Medal, Wallet, PiggyBank, BarChart3, Wand2, Settings, BookOpen, HelpCircle, User, LayoutGrid,
  Mail, Briefcase,
} from "lucide-react";

// Couche DOMAIN du SHELL modern (sidebar adaptative). PORT FIDÈLE de la config nav de `components/DashboardLayout`
// (NAV_GROUPS + permissions + modules actifs). 0 React/tRPC : data + fonctions pures testables. Les libellés
// restent des chaînes (clé de jointure avec MODULE_TO_LABELS/ALWAYS_VISIBLE_LABELS) ; l'i18n se fera en UI.

export type GroupId = "assistant" | "dashboard" | "commercial" | "clients" | "terrain" | "gestion" | "finance" | "parametres";
export type NavColor = "violet" | "blue" | "emerald" | "orange" | "rose" | "cyan" | "slate" | "purple";
export interface MenuItem { icon: LucideIcon; label: string; path: string; }
export interface NavGroup { id: GroupId; title: string; icon: LucideIcon; color: NavColor; items: MenuItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { id: "assistant", title: "MonAssistant", icon: Sparkles, color: "violet", items: [
    { icon: Sparkles, label: "MonAssistant", path: "/assistant" },
    { icon: History, label: "Mes conversations", path: "/assistant/conversations" },
    { icon: ScanLine, label: "Analyse photos IA", path: "/analyses-photos" },
  ] },
  { id: "dashboard", title: "Tableau de bord", icon: LayoutDashboard, color: "blue", items: [
    { icon: LayoutDashboard, label: "Tableau de bord", path: "/dashboard" },
    { icon: LineChart, label: "Statistiques", path: "/statistiques" },
  ] },
  { id: "commercial", title: "Commercial", icon: Briefcase, color: "emerald", items: [
    { icon: FileText, label: "Devis", path: "/devis" },
    { icon: FileText, label: "Nouveau devis", path: "/devis/nouveau" },
    { icon: Layers, label: "Variantes devis", path: "/devis-options" },
    { icon: Receipt, label: "Factures", path: "/factures" },
    { icon: ClipboardList, label: "Contrats", path: "/contrats" },
    { icon: RefreshCw, label: "Relances", path: "/relances" },
  ] },
  { id: "clients", title: "Clients", icon: Users, color: "orange", items: [
    { icon: Users, label: "Clients", path: "/clients" },
    { icon: Upload, label: "Nouveau Client", path: "/clients/nouveau" },
    { icon: Upload, label: "Import Clients", path: "/clients/import" },
    { icon: Star, label: "Avis Clients", path: "/avis" },
    { icon: Globe, label: "Portail client", path: "/portail-gestion" },
    { icon: MessageCircle, label: "Chat", path: "/chat" },
    { icon: Clock, label: "RDV en ligne", path: "/rdv-en-ligne" },
  ] },
  { id: "terrain", title: "Terrain", icon: Wrench, color: "rose", items: [
    { icon: Calendar, label: "Interventions", path: "/interventions" },
    { icon: CalendarDays, label: "Calendrier", path: "/calendrier" },
    { icon: Wrench, label: "Techniciens", path: "/techniciens" },
    { icon: MapPin, label: "Géolocalisation", path: "/geolocalisation" },
    { icon: HardHat, label: "Chantiers", path: "/chantiers" },
    { icon: Route, label: "Planification", path: "/planification" },
    { icon: Truck, label: "Véhicules", path: "/vehicules" },
    { icon: Car, label: "Flotte", path: "/flotte" },
  ] },
  { id: "gestion", title: "Gestion", icon: Package, color: "cyan", items: [
    { icon: Package, label: "Articles", path: "/articles" },
    { icon: Boxes, label: "Stocks", path: "/stocks" },
    { icon: ClipboardList, label: "Rapport Commande", path: "/rapport-commande" },
    { icon: ShoppingCart, label: "Commandes", path: "/commandes" },
    { icon: Building2, label: "Fournisseurs", path: "/fournisseurs" },
    { icon: FileText, label: "Rapports", path: "/rapports" },
    { icon: Calculator, label: "Comptabilité", path: "/comptabilite" },
    { icon: LineChart, label: "Prévisions CA", path: "/previsions" },
    { icon: Bell, label: "Alertes prévisions", path: "/alertes-previsions" },
    { icon: CalendarOff, label: "Congés", path: "/conges" },
    { icon: Trophy, label: "Badges", path: "/badges" },
    { icon: Medal, label: "Classement", path: "/classement" },
  ] },
  { id: "finance", title: "Finance & Dépenses", icon: Wallet, color: "purple", items: [
    { icon: Receipt, label: "Dépenses", path: "/depenses" },
    { icon: FileText, label: "Notes de frais", path: "/notes-de-frais" },
    { icon: PiggyBank, label: "Budgets", path: "/budgets-depenses" },
    { icon: Upload, label: "Import relevé", path: "/import-releve" },
    { icon: BarChart3, label: "Tableau de bord", path: "/tableau-bord-depenses" },
    { icon: Wand2, label: "Règles auto", path: "/regles-depenses" },
  ] },
  { id: "parametres", title: "Paramètres", icon: Settings, color: "slate", items: [
    { icon: BookOpen, label: "Guide d'utilisation", path: "/documentation" },
    { icon: HelpCircle, label: "Support", path: "/support" },
    { icon: User, label: "Mon profil", path: "/profil" },
    { icon: Settings, label: "Paramètres", path: "/parametres" },
    { icon: LayoutGrid, label: "Mes modules", path: "/modules" },
    { icon: Upload, label: "Importer des données", path: "/import" },
    { icon: Globe, label: "Ma Vitrine", path: "/ma-vitrine" },
    { icon: Mail, label: "Modèles Email", path: "/modeles-email" },
    { icon: Mail, label: "Modèles Transactionnels", path: "/modeles-email-transactionnels" },
    { icon: History, label: "Historique emails", path: "/historique-emails" },
    { icon: Users, label: "Utilisateurs", path: "/utilisateurs" },
  ] },
];

export const pathPermissionMap: Record<string, string> = {
  "/dashboard": "dashboard.voir", "/statistiques": "statistiques.voir", "/devis": "devis.voir",
  "/devis/nouveau": "devis.creer", "/factures": "factures.voir", "/contrats": "contrats.voir",
  "/relances": "relances.voir", "/clients": "clients.voir", "/clients/nouveau": "clients.gerer",
  "/clients/import": "clients.gerer", "/avis": "clients.voir", "/portail-gestion": "portail.gerer",
  "/chat": "chat.voir", "/rdv-en-ligne": "rdv.gerer", "/interventions": "interventions.voir",
  "/calendrier": "calendrier.voir", "/techniciens": "techniciens.voir", "/geolocalisation": "geolocalisation.voir",
  "/chantiers": "chantiers.voir", "/planification": "interventions.gerer", "/articles": "articles.voir",
  "/stocks": "articles.voir", "/rapport-commande": "exports.voir", "/commandes": "articles.voir",
  "/fournisseurs": "articles.voir", "/rapports": "exports.voir", "/comptabilite": "comptabilite.voir",
  "/previsions": "comptabilite.voir", "/parametres": "parametres.voir", "/ma-vitrine": "vitrine.gerer",
  "/modeles-email": "parametres.voir", "/modeles-email-transactionnels": "parametres.voir",
  "/utilisateurs": "utilisateurs.gerer", "/profil": "", "/assistant": "", "/notifications": "",
  "/documentation": "", "/mobile": "interventions.voir", "/integrations-comptables": "comptabilite.voir",
  "/devis-ia": "devis.creer", "/calendrier-chantiers": "chantiers.voir", "/tableau-bord-sync-comptable": "comptabilite.voir",
  "/performances-fournisseurs": "articles.voir", "/vehicules": "interventions.voir", "/flotte": "interventions.voir",
  "/badges": "techniciens.voir", "/alertes-previsions": "comptabilite.voir", "/conges": "techniciens.voir",
  "/devis-options": "devis.voir", "/classement": "techniciens.voir", "/analyses-photos": "devis.creer",
  "/depenses": "comptabilite.voir", "/depenses/nouvelle": "comptabilite.voir", "/notes-de-frais": "comptabilite.voir",
  "/budgets-depenses": "comptabilite.voir", "/import-releve": "comptabilite.voir", "/tableau-bord-depenses": "comptabilite.voir",
  "/regles-depenses": "comptabilite.voir", "/modules": "", "/onboarding": "", "/import": "",
};

// Filtre les items d'un groupe selon les permissions. Vide → show-all. PUR.
export function filterGroupByPermissions(group: NavGroup, permissions: string[]): NavGroup {
  if (permissions.length === 0) return group;
  return { ...group, items: group.items.filter((item) => {
    const required = pathPermissionMap[item.path];
    if (!required) return true;
    return permissions.includes(required);
  }) };
}

export const MODULE_TO_LABELS: Record<string, string[]> = {
  devis: ["Devis", "Nouveau devis", "Variantes devis"], factures: ["Factures"], contrats: ["Contrats"],
  relances: ["Relances"], clients: ["Clients", "Nouveau Client", "Import Clients", "Avis Clients"],
  portail_client: ["Portail client"], chat: ["Chat"], rdv: ["RDV en ligne"],
  interventions: ["Interventions", "Calendrier", "Chantiers", "Planification"],
  geolocalisation: ["Géolocalisation", "Techniciens"], stocks: ["Stocks", "Articles"],
  commandes: ["Commandes", "Fournisseurs", "Rapport Commande"],
  comptabilite: ["Comptabilité", "Rapports", "Prévisions CA", "Alertes prévisions"],
  assistant_ia: ["MonAssistant", "Analyse photos IA"],
  depenses: ["Dépenses", "Notes de frais", "Import relevé", "Tableau de bord", "Règles auto"],
  budgets: ["Budgets"], vehicules: ["Véhicules", "Flotte"], conges: ["Congés"], badges: ["Badges", "Classement"],
};

export const ALWAYS_VISIBLE_LABELS = new Set([
  "Tableau de bord", "Statistiques", "Mon profil", "Paramètres", "Guide d'utilisation", "Mes modules",
]);

// Filtre les items d'un groupe selon les modules actifs. null (loading/déconnecté) → show-all. PUR.
export function filterGroupByModules(group: NavGroup, modulesActifs: string[] | null): NavGroup {
  if (!modulesActifs) return group;
  const labelToModules = new Map<string, string[]>();
  for (const [moduleSlug, labels] of Object.entries(MODULE_TO_LABELS)) {
    for (const lbl of labels) {
      const arr = labelToModules.get(lbl) || [];
      arr.push(moduleSlug);
      labelToModules.set(lbl, arr);
    }
  }
  const actifsSet = new Set(modulesActifs);
  return { ...group, items: group.items.filter((item) => {
    if (ALWAYS_VISIBLE_LABELS.has(item.label)) return true;
    const owners = labelToModules.get(item.label);
    if (!owners) return true;
    return owners.some((slug) => actifsSet.has(slug));
  }) };
}

// Contexte MonAssistant pour une route (remonte les segments parents). PUR.
const ASSISTANT_FALLBACK = { context: "L'artisan utilise Operioz.", prompts: ["Résume mon activité", "Quelles sont mes priorités aujourd'hui ?"] };
export const ASSISTANT_CONTEXTS: Record<string, { context: string; prompts: string[] }> = {
  "/dashboard": { context: "L'artisan consulte son tableau de bord.", prompts: ["Résume mon activité du mois", "Quelles sont mes priorités aujourd'hui ?", "Analyse ma rentabilité"] },
  "/devis": { context: "L'artisan consulte sa liste de devis.", prompts: ["Crée un nouveau devis pour un client", "Quels devis sont en attente de réponse ?", "Relance les devis non signés"] },
  "/devis/nouveau": { context: "L'artisan crée un nouveau devis.", prompts: ["Génère un devis pour une rénovation salle de bain", "Ajoute les lignes pour une installation électrique", "Calcule le prix pour 3 jours de main d'œuvre"] },
  "/factures": { context: "L'artisan consulte ses factures.", prompts: ["Quelles factures sont impayées ?", "Rédige une relance pour les retards", "Quel est mon CA ce mois ?"] },
  "/interventions": { context: "L'artisan gère son planning d'interventions.", prompts: ["Planifie une intervention pour demain", "Quelles interventions sont prévues cette semaine ?", "Crée une intervention d'urgence"] },
  "/clients": { context: "L'artisan consulte sa base clients.", prompts: ["Trouve le client avec des impayés", "Quels clients n'ont pas commandé depuis 3 mois ?", "Rédige un email de prospection"] },
  "/commandes": { context: "L'artisan gère ses bons de commande fournisseurs.", prompts: ["Crée un bon de commande pour Point P", "Quelles commandes sont en attente ?", "Liste les articles à commander"] },
  "/stocks": { context: "L'artisan consulte ses stocks.", prompts: ["Quels articles sont en rupture ?", "Génère une commande de réapprovisionnement", "Combien de stock il me reste ?"] },
};
export function getAssistantContextForPath(path: string): { context: string; prompts: string[] } {
  if (ASSISTANT_CONTEXTS[path]) return ASSISTANT_CONTEXTS[path];
  const parts = path.split("/").filter(Boolean);
  while (parts.length > 0) {
    parts.pop();
    const candidate = "/" + parts.join("/");
    if (ASSISTANT_CONTEXTS[candidate]) return ASSISTANT_CONTEXTS[candidate];
  }
  return ASSISTANT_FALLBACK;
}

// Nav mobile primaire (barre du bas). PORT FIDÈLE.
export const MOBILE_PRIMARY: { id: GroupId; path: string; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", path: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { id: "commercial", path: "/devis", label: "Commercial", icon: Briefcase },
  { id: "clients", path: "/clients", label: "Clients", icon: Users },
  { id: "terrain", path: "/interventions", label: "Terrain", icon: Wrench },
];

// Composition de la sidebar : permissions → modules actifs → drop des groupes vides. PUR (port lignes 763-767).
export function buildSidebarGroups(permissions: string[], modulesActifs: string[] | null): NavGroup[] {
  return NAV_GROUPS
    .map((g) => filterGroupByPermissions(g, permissions))
    .map((g) => filterGroupByModules(g, modulesActifs))
    .filter((g) => g.items.length > 0);
}

// Un item est actif si l'URL = son path OU sa version /v2 migrée. `resolveV2Path` injecté → PUR/testable.
export function isPathActive(location: string, path: string, resolveV2Path: (p: string) => string | null): boolean {
  return location === path || location === resolveV2Path(path);
}

// Groupe/item actif pour l'URL courante. PUR (resolveV2Path injecté).
export function resolveActiveItem(groups: NavGroup[], location: string, resolveV2Path: (p: string) => string | null): MenuItem | undefined {
  return groups.flatMap((g) => g.items).find((i) => isPathActive(location, i.path, resolveV2Path));
}
export function resolveActiveGroup(groups: NavGroup[], location: string, resolveV2Path: (p: string) => string | null): NavGroup | undefined {
  return groups.find((g) => g.items.some((i) => isPathActive(location, i.path, resolveV2Path)));
}

// Date relative FR pour la cloche de notifications. PUR.
export function formatRelativeDate(date: string | Date): string {
  const d = new Date(date);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
