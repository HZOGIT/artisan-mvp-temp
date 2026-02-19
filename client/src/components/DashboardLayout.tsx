import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { Upload } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Users, FileText, Receipt, Calendar, CalendarDays, Package, User, Settings, BarChart3, Boxes, Building2, ClipboardList, RefreshCw, Mail, Star, Calculator, Route, LineChart, HardHat, ChevronRight, Globe, Wrench, MessageCircle, MapPin, Sparkles, Bell, CheckCircle, AlertTriangle, Clock, Info, XCircle } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { trpc } from "@/lib/trpc";

const notifTypeIcon: Record<string, any> = {
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
  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function RdvPendingBadge() {
  const { data: count } = trpc.rdv.getPendingCount.useQuery(undefined, { refetchInterval: 30000 });
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
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({ onSuccess: () => refetch() });
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({ onSuccess: () => refetch() });

  const handleClick = (notif: any) => {
    if (!notif.lu) markAsReadMutation.mutate({ id: notif.id });
    if (notif.lien) { setOpen(false); setLocation(notif.lien); }
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
            onClick={() => { setOpen(false); setLocation("/notifications"); }}
            className="text-xs text-primary hover:underline w-full text-center"
          >
            Voir toutes les notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type MenuItem = { icon: any; label: string; path: string };

interface MenuGroup {
  title: string;
  icon: any;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    title: "MonAssistant",
    icon: Sparkles,
    items: [
      { icon: Sparkles, label: "MonAssistant", path: "/assistant" },
    ],
  },
  {
    title: "Tableau de bord",
    icon: LayoutDashboard,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: BarChart3, label: "Statistiques", path: "/statistiques" },
    ],
  },
  {
    title: "Commercial",
    icon: FileText,
    items: [
      { icon: FileText, label: "Devis", path: "/devis" },
      { icon: FileText, label: "Nouveau Devis", path: "/devis/nouveau" },
      { icon: Receipt, label: "Factures", path: "/factures" },
      { icon: ClipboardList, label: "Contrats", path: "/contrats" },
      { icon: RefreshCw, label: "Relances", path: "/relances" },
    ],
  },
  {
    title: "Clients",
    icon: Users,
    items: [
      { icon: Users, label: "Clients", path: "/clients" },
      { icon: Upload, label: "Nouveau Client", path: "/clients/nouveau" },
      { icon: Upload, label: "Import Clients", path: "/clients/import" },
      { icon: Star, label: "Avis Clients", path: "/avis" },
      { icon: Globe, label: "Portail Client", path: "/portail-gestion" },
      { icon: MessageCircle, label: "Chat", path: "/chat" },
      { icon: Clock, label: "RDV en ligne", path: "/rdv-en-ligne" },
    ],
  },
  {
    title: "Terrain",
    icon: Calendar,
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
    title: "Gestion",
    icon: Package,
    items: [
      { icon: Package, label: "Articles", path: "/articles" },
      { icon: Boxes, label: "Stocks", path: "/stocks" },
      { icon: ClipboardList, label: "Rapport Commande", path: "/rapport-commande" },
      { icon: Building2, label: "Fournisseurs", path: "/fournisseurs" },
      { icon: FileText, label: "Rapports", path: "/rapports" },
      { icon: Calculator, label: "Comptabilité", path: "/comptabilite" },
      { icon: LineChart, label: "Prévisions CA", path: "/previsions" },
    ],
  },
  {
    title: "Paramètres",
    icon: Settings,
    items: [
      { icon: User, label: "Mon profil", path: "/profil" },
      { icon: Settings, label: "Paramètres", path: "/parametres" },
      { icon: Globe, label: "Ma Vitrine", path: "/ma-vitrine" },
      { icon: Mail, label: "Modèles Email", path: "/modeles-email" },
      { icon: Mail, label: "Modèles Transactionnels", path: "/modeles-email-transactionnels" },
    ],
  },
];

const allMenuItems = menuGroups.flatMap((g) => g.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = allMenuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  // Controlled collapsible state: only the group containing the active page is initially open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuGroups.forEach((group) => {
      initial[group.title] = group.items.some((item) => location === item.path);
    });
    return initial;
  });

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    Artisan MVP
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            <SidebarMenu className="px-2 py-1">
              {menuGroups.map((group) => {
                return (
                  <Collapsible
                    key={group.title}
                    open={openGroups[group.title] ?? false}
                    onOpenChange={(open) =>
                      setOpenGroups((prev) => ({ ...prev, [group.title]: open }))
                    }
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={group.title}
                          className="h-9 font-medium text-muted-foreground hover:text-foreground"
                        >
                          <group.icon className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-wider">{group.title}</span>
                          <ChevronRight className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="pl-2">
                          {group.items.map((item) => {
                            const isActive = location === item.path;
                            return (
                              <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton
                                  isActive={isActive}
                                  onClick={() => setLocation(item.path)}
                                  tooltip={item.label}
                                  className="h-9 transition-all font-normal"
                                >
                                  <item.icon
                                    className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                                  />
                                  <span>{item.label}</span>
                                  {item.path === "/rdv-en-ligne" && <RdvPendingBadge />}
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />}
            <span className="tracking-tight text-foreground font-medium">
              {activeMenuItem?.label ?? "Menu"}
            </span>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-4 min-w-0">{children}</main>
      </SidebarInset>
    </>
  );
}
