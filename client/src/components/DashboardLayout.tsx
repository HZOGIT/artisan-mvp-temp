import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useAssistantStream } from "@/hooks/useAssistantStream";
import { AssistantFAB } from "./AssistantFAB";
import { AssistantDrawer, type AssistantPanelSize } from "./AssistantDrawer";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CheckCircle,
  Clock,
  FileText,
  Globe,
  HardHat,
  Info,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  PanelLeft,
  RefreshCw,
  Receipt,
  Route,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Upload,
  User,
  Users,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

// ============================================================================
// MonAssistant — contextes par route
// ============================================================================

const ASSISTANT_CONTEXTS: Record<string, { context: string; prompts: string[] }> = {
  "/dashboard": {
    context: "L'artisan consulte son tableau de bord.",
    prompts: [
      "Résume mon activité du mois",
      "Quelles sont mes priorités aujourd'hui ?",
      "Analyse ma rentabilité",
    ],
  },
  "/devis": {
    context: "L'artisan consulte sa liste de devis.",
    prompts: [
      "Crée un nouveau devis pour un client",
      "Quels devis sont en attente de réponse ?",
      "Relance les devis non signés",
    ],
  },
  "/devis/nouveau": {
    context: "L'artisan crée un nouveau devis.",
    prompts: [
      "Génère un devis pour une rénovation salle de bain",
      "Ajoute les lignes pour une installation électrique",
      "Calcule le prix pour 3 jours de main d'œuvre",
    ],
  },
  "/factures": {
    context: "L'artisan consulte ses factures.",
    prompts: [
      "Quelles factures sont impayées ?",
      "Rédige une relance pour les retards",
      "Quel est mon CA ce mois ?",
    ],
  },
  "/interventions": {
    context: "L'artisan gère son planning d'interventions.",
    prompts: [
      "Planifie une intervention pour demain",
      "Quelles interventions sont prévues cette semaine ?",
      "Crée une intervention d'urgence",
    ],
  },
  "/clients": {
    context: "L'artisan consulte sa base clients.",
    prompts: [
      "Trouve le client avec des impayés",
      "Quels clients n'ont pas commandé depuis 3 mois ?",
      "Rédige un email de prospection",
    ],
  },
  "/commandes": {
    context: "L'artisan gère ses bons de commande fournisseurs.",
    prompts: [
      "Crée un bon de commande pour Point P",
      "Quelles commandes sont en attente ?",
      "Liste les articles à commander",
    ],
  },
  "/stocks": {
    context: "L'artisan consulte ses stocks.",
    prompts: [
      "Quels articles sont en rupture ?",
      "Génère une commande de réapprovisionnement",
      "Combien de stock il me reste ?",
    ],
  },
};

const ASSISTANT_FALLBACK = {
  context: "L'artisan utilise Operioz.",
  prompts: ["Résume mon activité", "Quelles sont mes priorités aujourd'hui ?"],
};

function getAssistantContextForPath(path: string) {
  if (ASSISTANT_CONTEXTS[path]) return ASSISTANT_CONTEXTS[path];
  const parts = path.split("/").filter(Boolean);
  while (parts.length > 0) {
    parts.pop();
    const candidate = "/" + parts.join("/");
    if (ASSISTANT_CONTEXTS[candidate]) return ASSISTANT_CONTEXTS[candidate];
  }
  return ASSISTANT_FALLBACK;
}

// ============================================================================
// Navigation — groupes + items + permissions + style rail
// ============================================================================

type GroupId =
  | "assistant"
  | "dashboard"
  | "commercial"
  | "clients"
  | "terrain"
  | "gestion"
  | "parametres";

interface MenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

interface NavGroup {
  id: GroupId;
  title: string;
  icon: LucideIcon;
  /** Couleur dominante du groupe (utilisée pour le surlignage). */
  color: "violet" | "blue" | "emerald" | "orange" | "rose" | "cyan" | "slate";
  items: MenuItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "assistant",
    title: "MonAssistant",
    icon: Sparkles,
    color: "violet",
    items: [{ icon: Sparkles, label: "MonAssistant", path: "/assistant" }],
  },
  {
    id: "dashboard",
    title: "Tableau de bord",
    icon: LayoutDashboard,
    color: "blue",
    items: [
      { icon: LayoutDashboard, label: "Tableau de bord", path: "/dashboard" },
      { icon: LineChart, label: "Statistiques", path: "/statistiques" },
    ],
  },
  {
    id: "commercial",
    title: "Commercial",
    icon: Briefcase,
    color: "emerald",
    items: [
      { icon: FileText, label: "Devis", path: "/devis" },
      { icon: FileText, label: "Nouveau devis", path: "/devis/nouveau" },
      { icon: Receipt, label: "Factures", path: "/factures" },
      { icon: ClipboardList, label: "Contrats", path: "/contrats" },
      { icon: RefreshCw, label: "Relances", path: "/relances" },
    ],
  },
  {
    id: "clients",
    title: "Clients",
    icon: Users,
    color: "orange",
    items: [
      { icon: Users, label: "Clients", path: "/clients" },
      { icon: Upload, label: "Nouveau Client", path: "/clients/nouveau" },
      { icon: Upload, label: "Import Clients", path: "/clients/import" },
      { icon: Star, label: "Avis Clients", path: "/avis" },
      { icon: Globe, label: "Portail client", path: "/portail-gestion" },
      { icon: MessageCircle, label: "Chat", path: "/chat" },
      { icon: Clock, label: "RDV en ligne", path: "/rdv-en-ligne" },
    ],
  },
  {
    id: "terrain",
    title: "Terrain",
    icon: Wrench,
    color: "rose",
    items: [
      { icon: Calendar, label: "Interventions", path: "/interventions" },
      { icon: CalendarDays, label: "Calendrier", path: "/calendrier" },
      { icon: Wrench, label: "Techniciens", path: "/techniciens" },
      { icon: MapPin, label: "Géolocalisation", path: "/geolocalisation" },
      { icon: HardHat, label: "Chantiers", path: "/chantiers" },
      { icon: Route, label: "Planification", path: "/planification" },
    ],
  },
  {
    id: "gestion",
    title: "Gestion",
    icon: Package,
    color: "cyan",
    items: [
      { icon: Package, label: "Articles", path: "/articles" },
      { icon: Boxes, label: "Stocks", path: "/stocks" },
      { icon: ClipboardList, label: "Rapport Commande", path: "/rapport-commande" },
      { icon: ShoppingCart, label: "Commandes", path: "/commandes" },
      { icon: Building2, label: "Fournisseurs", path: "/fournisseurs" },
      { icon: FileText, label: "Rapports", path: "/rapports" },
      { icon: Calculator, label: "Comptabilité", path: "/comptabilite" },
      { icon: LineChart, label: "Prévisions CA", path: "/previsions" },
    ],
  },
  {
    id: "parametres",
    title: "Paramètres",
    icon: Settings,
    color: "slate",
    items: [
      { icon: BookOpen, label: "Guide d'utilisation", path: "/documentation" },
      { icon: User, label: "Mon profil", path: "/profil" },
      { icon: Settings, label: "Paramètres", path: "/parametres" },
      { icon: LayoutGrid, label: "Mes modules", path: "/modules" },
      { icon: Upload, label: "Importer des données", path: "/import" },
      { icon: Globe, label: "Ma Vitrine", path: "/ma-vitrine" },
      { icon: Mail, label: "Modèles Email", path: "/modeles-email" },
      { icon: Mail, label: "Modèles Transactionnels", path: "/modeles-email-transactionnels" },
      { icon: Users, label: "Utilisateurs", path: "/utilisateurs" },
    ],
  },
];

const pathPermissionMap: Record<string, string> = {
  "/dashboard": "dashboard.voir",
  "/statistiques": "statistiques.voir",
  "/devis": "devis.voir",
  "/devis/nouveau": "devis.creer",
  "/factures": "factures.voir",
  "/contrats": "contrats.voir",
  "/relances": "relances.voir",
  "/clients": "clients.voir",
  "/clients/nouveau": "clients.gerer",
  "/clients/import": "clients.gerer",
  "/avis": "clients.voir",
  "/portail-gestion": "portail.gerer",
  "/chat": "chat.voir",
  "/rdv-en-ligne": "rdv.gerer",
  "/interventions": "interventions.voir",
  "/calendrier": "calendrier.voir",
  "/techniciens": "techniciens.voir",
  "/geolocalisation": "geolocalisation.voir",
  "/chantiers": "chantiers.voir",
  "/planification": "interventions.gerer",
  "/articles": "articles.voir",
  "/stocks": "articles.voir",
  "/rapport-commande": "exports.voir",
  "/commandes": "articles.voir",
  "/fournisseurs": "articles.voir",
  "/rapports": "exports.voir",
  "/comptabilite": "comptabilite.voir",
  "/previsions": "comptabilite.voir",
  "/parametres": "parametres.voir",
  "/ma-vitrine": "vitrine.gerer",
  "/modeles-email": "parametres.voir",
  "/modeles-email-transactionnels": "parametres.voir",
  "/utilisateurs": "utilisateurs.gerer",
  "/profil": "",
  "/assistant": "",
  "/notifications": "",
  "/documentation": "",
  "/mobile": "interventions.voir",
  "/integrations-comptables": "comptabilite.voir",
  "/devis-ia": "devis.creer",
  "/calendrier-chantiers": "chantiers.voir",
  "/tableau-bord-sync-comptable": "comptabilite.voir",
  "/performances-fournisseurs": "articles.voir",
  "/vehicules": "interventions.voir",
  "/badges": "techniciens.voir",
  "/alertes-previsions": "comptabilite.voir",
  "/conges": "techniciens.voir",
  "/modules": "",
  "/onboarding": "",
  "/import": "",
};

function filterGroupByPermissions(group: NavGroup, permissions: string[]): NavGroup {
  if (permissions.length === 0) return group;
  return {
    ...group,
    items: group.items.filter((item) => {
      const required = pathPermissionMap[item.path];
      if (!required) return true;
      return permissions.includes(required);
    }),
  };
}

// ============================================================================
// Sidebar adaptative selon les modules actifs de l'artisan
// ============================================================================
const MODULE_TO_LABELS: Record<string, string[]> = {
  devis: ["Devis", "Nouveau devis"],
  factures: ["Factures"],
  contrats: ["Contrats"],
  relances: ["Relances"],
  clients: ["Clients", "Nouveau Client", "Import Clients", "Avis Clients"],
  portail_client: ["Portail client"],
  chat: ["Chat"],
  rdv: ["RDV en ligne"],
  interventions: ["Interventions", "Calendrier", "Chantiers", "Planification"],
  geolocalisation: ["Géolocalisation", "Techniciens"],
  stocks: ["Stocks", "Articles"],
  commandes: ["Commandes", "Fournisseurs", "Rapport Commande"],
  comptabilite: ["Comptabilité", "Rapports", "Prévisions CA"],
  assistant_ia: ["MonAssistant"],
};

const ALWAYS_VISIBLE_LABELS = new Set([
  "Tableau de bord",
  "Statistiques",
  "Mon profil",
  "Paramètres",
  "Guide d'utilisation",
  "Mes modules",
]);

/**
 * Filtre les items d'un groupe selon la liste des modules actifs.
 * Si modulesActifs est null (loading, pas connecte) → fallback show-all.
 */
function filterGroupByModules(group: NavGroup, modulesActifs: string[] | null): NavGroup {
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
  return {
    ...group,
    items: group.items.filter((item) => {
      if (ALWAYS_VISIBLE_LABELS.has(item.label)) return true;
      const owners = labelToModules.get(item.label);
      if (!owners) return true;
      return owners.some((slug) => actifsSet.has(slug));
    }),
  };
}

const RAIL_COLORS: Record<NavGroup["color"], { iconActive: string; bgActive: string; ring: string; hover: string }> = {
  violet: {
    iconActive: "text-violet-500",
    bgActive: "bg-violet-100 dark:bg-violet-900/30",
    ring: "ring-violet-500/30",
    hover: "hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20",
  },
  blue: {
    iconActive: "text-blue-500",
    bgActive: "bg-blue-100 dark:bg-blue-900/30",
    ring: "ring-blue-500/30",
    hover: "hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
  },
  emerald: {
    iconActive: "text-emerald-500",
    bgActive: "bg-emerald-100 dark:bg-emerald-900/30",
    ring: "ring-emerald-500/30",
    hover: "hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
  },
  orange: {
    iconActive: "text-orange-500",
    bgActive: "bg-orange-100 dark:bg-orange-900/30",
    ring: "ring-orange-500/30",
    hover: "hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20",
  },
  rose: {
    iconActive: "text-rose-500",
    bgActive: "bg-rose-100 dark:bg-rose-900/30",
    ring: "ring-rose-500/30",
    hover: "hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20",
  },
  cyan: {
    iconActive: "text-cyan-500",
    bgActive: "bg-cyan-100 dark:bg-cyan-900/30",
    ring: "ring-cyan-500/30",
    hover: "hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20",
  },
  slate: {
    iconActive: "text-slate-700 dark:text-slate-300",
    bgActive: "bg-slate-100 dark:bg-slate-800",
    ring: "ring-slate-500/30",
    hover: "hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  },
};

// ============================================================================
// Notifications — cloche + badge RDV
// ============================================================================

const notifTypeIcon: Record<string, LucideIcon> = {
  succes: CheckCircle,
  alerte: AlertTriangle,
  rappel: Clock,
  info: Info,
  erreur: XCircle,
};

const notifTypeColor: Record<string, string> = {
  succes: "text-green-500",
  alerte: "text-orange-500",
  rappel: "text-blue-500",
  info: "text-sky-500",
  erreur: "text-red-500",
};

function formatRelativeDate(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function RdvPendingBadge() {
  const { data: count } = trpc.rdv.getPendingCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  if (!count) return null;
  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-5 text-center">
      {count}
    </span>
  );
}

function NotificationBell() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: notifications = [], refetch } = trpc.notifications.list.useQuery(
    { limit: 10 },
    { enabled: open }
  );
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => refetch(),
  });

  const handleClick = (notif: any) => {
    if (!notif.lu) markAsReadMutation.mutate({ id: notif.id });
    if (notif.lien) {
      setOpen(false);
      setLocation(notif.lien);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-xs text-primary hover:underline"
            >
              Tout marquer comme lu
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aucune notification
            </div>
          ) : (
            <div>
              {notifications.map((notif: any) => {
                const Icon = notifTypeIcon[notif.type] || Info;
                const color = notifTypeColor[notif.type] || "text-muted-foreground";
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b last:border-b-0 ${
                      !notif.lu ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${!notif.lu ? "font-semibold" : ""}`}>
                            {notif.titre}
                          </span>
                          {!notif.lu && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        {notif.message && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {notif.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeDate(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <button
            onClick={() => {
              setOpen(false);
              setLocation("/notifications");
            }}
            className="text-xs text-primary hover:underline w-full text-center"
          >
            Voir toutes les notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Constantes layout
// ============================================================================

const ASSISTANT_PANEL_SIZE_KEY = "operioz.assistant.panelSize";
const ASSISTANT_PANEL_MARGIN: Record<AssistantPanelSize, string> = {
  sm: "md:mr-[380px]",
  md: "md:mr-[520px]",
  lg: "md:mr-[700px]",
};

function readPanelSize(): AssistantPanelSize {
  if (typeof window === "undefined") return "md";
  const raw = window.localStorage.getItem(ASSISTANT_PANEL_SIZE_KEY);
  return raw === "sm" || raw === "md" || raw === "lg" ? raw : "md";
}

// Items visibles dans la bottom nav mobile (par défaut). "Plus" → drawer avec
// les groupes restants.
const MOBILE_PRIMARY: { id: GroupId; path: string; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", path: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { id: "commercial", path: "/devis", label: "Commercial", icon: Briefcase },
  { id: "clients", path: "/clients", label: "Clients", icon: Users },
  { id: "terrain", path: "/interventions", label: "Terrain", icon: Wrench },
];

// ============================================================================
// DashboardLayout
// ============================================================================

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Connexion requise
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            L'accès à cette application nécessite une authentification.
          </p>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: artisanProfile } = trpc.artisan.getProfile.useQuery();
  // Modules actifs pour cet artisan. Quand isLoading ou pas connecté → null
  // (= show-all, comportement actuel) pour ne pas masquer la nav pendant
  // le 1er fetch ni si le backend modules est down.
  const { data: modulesActifsRaw } = trpc.modules.getMine.useQuery();
  const modulesActifs = modulesActifsRaw ?? null;
  const userPermissions: string[] = (user as any)?.permissions || [];

  // Groupes filtrés : (1) permissions utilisateur, (2) modules actifs.
  const filteredGroups: NavGroup[] = useMemo(
    () =>
      NAV_GROUPS.map((g) => filterGroupByPermissions(g, userPermissions))
        .map((g) => filterGroupByModules(g, modulesActifs))
        .filter((g) => g.items.length > 0),
    [userPermissions, modulesActifs]
  );

  const flatItems = useMemo(
    () => filteredGroups.flatMap((g) => g.items),
    [filteredGroups]
  );
  const activeItem = flatItems.find((i) => i.path === location);
  const activeGroup = filteredGroups.find((g) =>
    g.items.some((i) => i.path === location)
  );

  // Panneau de navigation (overlay) déployé pour un groupe donné
  const [openGroupId, setOpenGroupId] = useState<GroupId | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  // Etat des groupes ouverts dans le drawer mobile (accordion).
  // Seul le groupe contenant la route active est ouvert par defaut ; les autres
  // sont replies pour eviter le mur d'items sur iPhone.
  const [openMobileGroups, setOpenMobileGroups] = useState<Set<string>>(new Set());

  // MonAssistant
  const [isAssistantOpen, setIsAssistantOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [panelSize, setPanelSize] = useState<AssistantPanelSize>(() => readPanelSize());
  useEffect(() => {
    try {
      window.localStorage.setItem(ASSISTANT_PANEL_SIZE_KEY, panelSize);
    } catch {
      /* noop */
    }
  }, [panelSize]);

  const isAssistantPage = location === "/assistant";
  const { context: assistantContext, prompts: assistantSuggestions } =
    getAssistantContextForPath(location);
  const queryClient = useQueryClient();
  const assistant = useAssistantStream({
    pageContext: assistantContext,
    onNavigate: ({ page, filtre }) => {
      const target = filtre ? `${page}?filtre=${encodeURIComponent(filtre)}` : page;
      setLocation(target);
    },
    onInvalidate: (keys) => {
      for (const key of keys) {
        queryClient.invalidateQueries({
          predicate: (query) => queryKeyContains(query.queryKey, key),
        });
      }
    },
  });

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ESC ferme le panneau de navigation
  useEffect(() => {
    if (!openGroupId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroupId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openGroupId]);

  // Ferme le panneau et le drawer mobile lors d'une navigation
  useEffect(() => {
    setOpenGroupId(null);
    setMobileMoreOpen(false);
  }, [location]);

  // Sync de l'accordion mobile : a chaque changement de route, on ouvre
  // automatiquement le groupe qui contient la route active. Les autres
  // groupes restent dans leur etat precedent (ouvert/ferme) — l'artisan
  // garde le controle s'il a deliberement ouvert/ferme un groupe.
  useEffect(() => {
    if (!activeGroup) return;
    setOpenMobileGroups((prev) => {
      if (prev.has(activeGroup.id)) return prev;
      const next = new Set(prev);
      next.add(activeGroup.id);
      return next;
    });
  }, [activeGroup]);

  // A chaque ouverture du drawer mobile, on REINITIALISE l'accordion :
  // tous les groupes sont fermes SAUF celui de la route active. Comportement
  // attendu par le spec ("Par defaut tous les groupes sont FERMES").
  useEffect(() => {
    if (mobileMoreOpen) {
      setOpenMobileGroups(new Set(activeGroup ? [activeGroup.id] : []));
    }
  }, [mobileMoreOpen, activeGroup]);

  const toggleMobileGroup = (gid: string) => {
    setOpenMobileGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const handleRailGroupClick = (group: NavGroup) => {
    // Groupe à 1 item → on navigue direct.
    if (group.items.length === 1) {
      setLocation(group.items[0].path);
      setOpenGroupId(null);
      return;
    }
    setOpenGroupId((prev) => (prev === group.id ? null : group.id));
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    setOpenGroupId(null);
    setMobileMoreOpen(false);
  };

  const userInitial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen flex bg-background text-foreground">
      {/* ─── RAIL — DESKTOP ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Navigation principale"
        className="hidden md:flex fixed inset-y-0 left-0 z-40 w-16 flex-col items-center justify-between border-r border-border bg-card/80 backdrop-blur-sm py-3"
      >
        <div className="flex flex-col items-center gap-1.5 w-full">
          <button
            onClick={() => setLocation("/dashboard")}
            aria-label="Accueil Operioz"
            className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white inline-flex items-center justify-center shadow-md hover:shadow-lg transition-shadow mb-2"
          >
            {artisanProfile?.logo ? (
              <img
                src={artisanProfile.logo}
                alt=""
                className="h-7 w-7 rounded object-contain"
              />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </button>
          {filteredGroups.map((group) => {
            const styles = RAIL_COLORS[group.color];
            const isActive = activeGroup?.id === group.id;
            const isOpen = openGroupId === group.id;
            const Icon = group.icon;
            return (
              <Tooltip key={group.id} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleRailGroupClick(group)}
                    aria-label={group.title}
                    aria-pressed={isActive}
                    className={`h-10 w-10 inline-flex items-center justify-center rounded-xl text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive || isOpen ? `${styles.bgActive} ${styles.iconActive}` : styles.hover
                    } ${group.id === "assistant" && isAssistantOpen ? "ring-2 ring-violet-500/30" : ""}`}
                  >
                    <Icon className="h-5 w-5" />
                    {group.id === "clients" && <RdvPendingBadge />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{group.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary text-secondary-foreground inline-flex items-center justify-center font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Mon compte"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs font-semibold">{userInitial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate">{user?.name || "—"}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email || ""}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/profil")}>
              <User className="h-4 w-4 mr-2" /> Mon profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/parametres")}>
              <Settings className="h-4 w-4 mr-2" /> Paramètres
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" /> Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* ─── PANNEAU DE NAVIGATION (overlay, desktop) ───────────────────────── */}
      <AnimatePresence>
        {openGroupId && (
          <>
            <motion.div
              key="nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="hidden md:block fixed inset-0 left-16 z-30 bg-background/40 backdrop-blur-[3px]"
              onClick={() => setOpenGroupId(null)}
              aria-hidden
            />
            {(() => {
              const group = filteredGroups.find((g) => g.id === openGroupId);
              if (!group) return null;
              const styles = RAIL_COLORS[group.color];
              const GroupIcon = group.icon;
              return (
                <motion.aside
                  key="nav-panel"
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  className="hidden md:flex fixed inset-y-0 left-16 z-30 w-60 flex-col border-r border-border bg-card shadow-xl"
                >
                  <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                    <div className={`h-9 w-9 rounded-lg ${styles.bgActive} inline-flex items-center justify-center`}>
                      <GroupIcon className={`h-4 w-4 ${styles.iconActive}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{group.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {group.items.length} {group.items.length > 1 ? "options" : "option"}
                      </p>
                    </div>
                    <button
                      onClick={() => setOpenGroupId(null)}
                      aria-label="Fermer le panneau"
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ScrollArea className="flex-1">
                    <ul className="p-2 space-y-0.5">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isItemActive = location === item.path;
                        return (
                          <li key={item.path}>
                            <button
                              onClick={() => handleNavigate(item.path)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                                isItemActive
                                  ? `${styles.bgActive} ${styles.iconActive} font-medium`
                                  : "text-foreground hover:bg-accent"
                              }`}
                            >
                              <ItemIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                              {item.path === "/rdv-en-ligne" && <RdvPendingBadge />}
                              {isItemActive && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-60" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                </motion.aside>
              );
            })()}
          </>
        )}
      </AnimatePresence>

      {/* ─── COLONNE PRINCIPALE ─────────────────────────────────────────────── */}
      <div
        className={`flex-1 min-w-0 flex flex-col md:ml-16 transition-[margin] duration-300 ease-out ${
          isAssistantOpen ? ASSISTANT_PANEL_MARGIN[panelSize] : ""
        }`}
      >
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 h-14 px-3 md:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {/* Sur mobile, bouton qui ouvre le drawer "Plus" */}
            <button
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-accent"
              onClick={() => setMobileMoreOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <span className="font-medium tracking-tight truncate text-sm md:text-base">
              {activeItem?.label || activeGroup?.title || "Operioz"}
            </span>
          </div>
          <NotificationBell />
        </header>

        {showInstallBanner && (
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">Installez Operioz</span> sur votre appareil pour un accès rapide
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowInstallBanner(false)}>
                Plus tard
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (installPrompt) {
                    installPrompt.prompt();
                    const result = await installPrompt.userChoice;
                    if (result.outcome === "accepted") setShowInstallBanner(false);
                    setInstallPrompt(null);
                  }
                }}
              >
                Installer
              </Button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 pb-20 md:pb-4 min-w-0 max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* ─── BOTTOM NAV — MOBILE ────────────────────────────────────────────── */}
      <nav
        aria-label="Navigation mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm"
      >
        <div className="grid grid-cols-5">
          {MOBILE_PRIMARY.map((p) => {
            const groupAvailable = filteredGroups.find((g) => g.id === p.id);
            if (!groupAvailable) return null;
            const isActive = location === p.path || activeGroup?.id === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => handleNavigate(p.path)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{p.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMobileMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-2.5 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">Plus</span>
          </button>
        </div>
      </nav>

      {/* ─── DRAWER MOBILE "PLUS" ───────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileMoreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setMobileMoreOpen(false)}
              aria-hidden
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-background shadow-2xl flex flex-col"
              role="dialog"
              aria-label="Menu principal"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 inline-flex items-center justify-center text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {artisanProfile?.nomEntreprise || "Operioz"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMoreOpen(false)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* overflow-y-auto natif (au lieu de Radix ScrollArea) : plus
                  fiable sur iOS Safari pour le calcul de hauteur. min-h-0
                  est CRITIQUE pour qu'un enfant flex-1 dans un parent flex
                  hauteur fixe puisse retrecir et scroller. */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="p-2 space-y-1">
                  {filteredGroups.map((group) => {
                    const styles = RAIL_COLORS[group.color];
                    const GroupIcon = group.icon;
                    const isOpen = openMobileGroups.has(group.id);
                    return (
                      <div key={group.id} className="rounded-lg overflow-hidden">
                        {/* Header cliquable du groupe */}
                        <button
                          type="button"
                          onClick={() => toggleMobileGroup(group.id)}
                          aria-expanded={isOpen}
                          className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg transition-colors ${
                            isOpen ? "bg-accent/50" : "hover:bg-accent/30"
                          }`}
                        >
                          <div className={`h-7 w-7 shrink-0 rounded-lg ${styles.bgActive} inline-flex items-center justify-center`}>
                            <GroupIcon className={`h-3.5 w-3.5 ${styles.iconActive}`} />
                          </div>
                          <span className="flex-1 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.title}
                          </span>
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                          />
                        </button>

                        {/* Items repliables — animation hauteur via AnimatePresence */}
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.ul
                              key="items"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <li className="pt-1 pb-1.5 space-y-0.5">
                                {group.items.map((item) => {
                                  const ItemIcon = item.icon;
                                  const isItemActive = location === item.path;
                                  return (
                                    <button
                                      key={item.path}
                                      type="button"
                                      onClick={() => handleNavigate(item.path)}
                                      className={`w-full flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm transition-colors text-left ${
                                        isItemActive
                                          ? `${styles.bgActive} ${styles.iconActive} font-medium`
                                          : "text-foreground hover:bg-accent"
                                      }`}
                                    >
                                      <ItemIcon className="h-4 w-4 shrink-0" />
                                      <span className="truncate">{item.label}</span>
                                      {item.path === "/rdv-en-ligne" && <RdvPendingBadge />}
                                    </button>
                                  );
                                })}
                              </li>
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className="p-3 border-t border-border shrink-0"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Déconnexion
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── MonAssistant FAB + Drawer ──────────────────────────────────────── */}
      <AssistantFAB
        onClick={() => setIsAssistantOpen(true)}
        hidden={isAssistantPage || isAssistantOpen}
      />
      <AssistantDrawer
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        messages={assistant.messages}
        isStreaming={assistant.isStreaming}
        onSendMessage={assistant.sendMessage}
        onClear={assistant.clearMessages}
        suggestedPrompts={assistantSuggestions}
        panelSize={panelSize}
        onPanelSizeChange={setPanelSize}
      />

    </div>
  );
}

/**
 * Vérifie récursivement si un queryKey tRPC contient une chaîne donnée.
 * Les queryKey tRPC ont la forme [["clients", "list"], { input: ... }] ;
 * un match en substring sur chaque string permet d'invalider toutes les
 * variantes d'une entité (list, byId, getUnreadCount, etc.) en une fois.
 */
function queryKeyContains(key: unknown, needle: string): boolean {
  if (typeof key === "string") return key.includes(needle);
  if (Array.isArray(key)) return key.some((k) => queryKeyContains(k, needle));
  return false;
}
