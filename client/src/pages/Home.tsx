import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLocation } from "wouter";
import {
  FileText,
  Users,
  Calendar,
  ArrowRight,
  Wrench,
  Receipt,
  Globe,
  Sparkles,
  CreditCard,
  MessageCircle,
  MapPin,
  ClipboardList,
  UserPlus,
  Settings,
  TrendingUp,
  Check,
  Star,
  Menu,
  X,
  Linkedin,
  Facebook,
  Instagram,
  ShieldCheck,
  Smartphone,
  Play,
  Phone,
  Mail,
  Zap,
  Lock,
  CheckCircle2,
  Leaf,
  Sofa,
  Truck,
  ShoppingBag,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { CookieBanner } from "@/components/CookieBanner";

/* ───────────────────────────── KEYFRAMES (inline) ───────────────────────────── */
/* Injected once. Tailwind handles everything else. */
const ANIMATIONS = `
  @keyframes float-slow { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(20px,-30px); } }
  @keyframes float-slower { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-25px,20px); } }
  @keyframes badge-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.45); } 50% { box-shadow: 0 0 0 10px rgba(96,165,250,0); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes shine { 0% { transform: translateX(-100%) skewX(-15deg); } 100% { transform: translateX(250%) skewX(-15deg); } }
  @keyframes grid-fade { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.28; } }
  @keyframes rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
`;

/* ───────────────────────────── HOOKS ───────────────────────────── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function useCountUp(target: number, durationMs = 1800) {
  const { ref, isVisible } = useScrollReveal();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.floor(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVisible, target, durationMs]);

  return { ref, value };
}

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/* ───────────────────────────── ROOT ───────────────────────────── */

export default function Home() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !loading) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS }} />
      <Navbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <HeroSection />
      <ReassuranceBand />
      <FeaturesSection />
      <TradesSection />
      <HowItWorksSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
      <CookieBanner />
    </div>
  );
}

/* ───────────────────────────── 1. NAVBAR ───────────────────────────── */

function Navbar({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}) {
  const scrolled = useScrolled(8);
  const scrollTo = useCallback(
    (id: string) => {
      setMobileMenuOpen(false);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    },
    [setMobileMenuOpen]
  );

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-b border-gray-200/60"
          : "bg-white/0 border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm group-hover:shadow-md transition-shadow">
              <Wrench className="h-5 w-5 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Operioz</span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {[
              { id: "fonctionnalites", label: "Fonctionnalités" },
              { id: "tarifs", label: "Tarifs" },
              { id: "temoignages", label: "Témoignages" },
              { id: "faq", label: "FAQ" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" asChild className="text-slate-700 hover:text-slate-900">
              <a href="/sign-in">Se connecter</a>
            </Button>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow group">
              <a href="/signup" className="inline-flex items-center gap-1.5">
                Essai gratuit
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
          </div>

          <button
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 space-y-3">
          {[
            { id: "fonctionnalites", label: "Fonctionnalités" },
            { id: "tarifs", label: "Tarifs" },
            { id: "temoignages", label: "Témoignages" },
            { id: "faq", label: "FAQ" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="block w-full text-left py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {item.label}
            </button>
          ))}
          <div className="pt-3 border-t border-gray-200 flex flex-col gap-2">
            <Button variant="outline" asChild className="w-full">
              <a href="/sign-in">Se connecter</a>
            </Button>
            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
              <a href="/signup">Essai gratuit</a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ───────────────────────────── 2. HERO ───────────────────────────── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      {/* Floating blurred shapes */}
      <div
        className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/25 blur-3xl"
        style={{ animation: "float-slow 14s ease-in-out infinite" }}
      />
      <div
        className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl"
        style={{ animation: "float-slower 18s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl"
        style={{ animation: "float-slow 22s ease-in-out infinite" }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-200 text-xs sm:text-sm font-medium backdrop-blur-sm"
               style={{ animation: "badge-pulse 2.6s ease-in-out infinite" }}>
            <Sparkles className="h-3.5 w-3.5" />
            <span>Nouveau — Conformité facturation 2026 incluse</span>
          </div>

          {/* Title */}
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Gérez votre activité,
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              quel que soit votre métier
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Devis, factures, clients, planning, paiements en ligne et assistant IA — tout en un. Pour les artisans, indépendants et professionnels du terrain.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="bg-blue-600 hover:bg-blue-500 text-base px-8 py-6 w-full sm:w-auto shadow-lg shadow-blue-900/40 group"
            >
              <a href="/signup" className="inline-flex items-center gap-2">
                Commencer gratuitement
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              asChild
              className="text-base px-8 py-6 w-full sm:w-auto text-white hover:bg-white/10 border border-white/20 hover:border-white/40"
            >
              <a href="#fonctionnalites" className="inline-flex items-center gap-2">
                <Play className="h-4 w-4" />
                Voir une démo
              </a>
            </Button>
          </div>

          {/* Trust strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs sm:text-sm text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <strong className="text-white font-semibold">4.9/5</strong> satisfaction
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-blue-300" />
              Données sécurisées
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              Sans engagement
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-blue-300" />
              100% mobile
            </span>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="mt-16 sm:mt-20 max-w-5xl mx-auto" style={{ perspective: "2400px" }}>
          <DashboardMockup />
        </div>
      </div>

      {/* Fade to white at bottom */}
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-b from-transparent to-white pointer-events-none" />
    </section>
  );
}

/* Fake dashboard preview — pure CSS/JSX */
function DashboardMockup() {
  return (
    <div
      className="relative rounded-2xl shadow-2xl shadow-blue-950/50 ring-1 ring-white/10 overflow-hidden bg-white"
      style={{ transform: "rotateX(6deg) rotateY(-3deg) rotateZ(-1deg)" }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 bg-slate-100 px-4 py-3 border-b border-slate-200">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="mx-auto px-3 py-1 bg-white rounded-md text-xs text-slate-500 ring-1 ring-slate-200 min-w-[14rem] text-center">
          app.operioz.com/dashboard
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-12 bg-white text-slate-900">
        {/* Sidebar */}
        <aside className="hidden sm:block col-span-3 bg-slate-50 border-r border-slate-200 p-4 text-xs">
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600">
              <Wrench className="h-4 w-4 text-white" />
            </span>
            <span className="font-bold text-sm text-slate-900">Operioz</span>
          </div>
          <ul className="space-y-1">
            {[
              { label: "Tableau de bord", active: true },
              { label: "Clients" },
              { label: "Devis" },
              { label: "Factures" },
              { label: "Planning" },
              { label: "Assistant IA" },
              { label: "Paramètres" },
            ].map((it) => (
              <li
                key={it.label}
                className={`px-2.5 py-2 rounded-md ${
                  it.active
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-600"
                }`}
              >
                {it.label}
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="col-span-12 sm:col-span-9 p-4 sm:p-6 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Bonjour, Marc 👋</p>
              <p className="text-sm font-semibold text-slate-900">Voici votre activité</p>
            </div>
            <span className="px-2.5 py-1 text-[10px] rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 font-medium">
              En ligne
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="CA du mois" value="12 450 €" trend="+18%" tone="blue" />
            <StatTile label="Devis en cours" value="8" trend="3 en attente" tone="violet" />
            <StatTile label="Taux d'encaissement" value="95%" trend="+4 pts" tone="green" />
          </div>

          {/* Recent devis */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Devis récents</p>
              <p className="text-[10px] text-slate-500">Voir tout →</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {[
                { ref: "2026-042", client: "SCI Les Terrasses", city: "Lyon", amount: "3 200 €", status: "Envoyé", statusTone: "bg-amber-50 text-amber-700 ring-amber-200" },
                { ref: "2026-041", client: "Restaurant Le Bouchon", city: "Paris", amount: "1 850 €", status: "Accepté", statusTone: "bg-green-50 text-green-700 ring-green-200" },
                { ref: "2026-040", client: "Cabinet Médical Presqu'île", city: "Lyon", amount: "5 400 €", status: "Signé", statusTone: "bg-blue-50 text-blue-700 ring-blue-200" },
              ].map((d) => (
                <li key={d.ref} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-slate-400">#{d.ref}</span>
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{d.client}</span>
                      <span className="text-[10px] text-slate-500">{d.city}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{d.amount}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${d.statusTone}`}>
                      {d.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  trend,
  tone,
}: {
  label: string;
  value: string;
  trend: string;
  tone: "blue" | "violet" | "green";
}) {
  const tones = {
    blue: "from-blue-500/10 to-blue-500/0 text-blue-600",
    violet: "from-violet-500/10 to-violet-500/0 text-violet-600",
    green: "from-green-500/10 to-green-500/0 text-green-600",
  } as const;
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-white relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} pointer-events-none`} />
      <div className="relative">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
        <p className="text-[10px] mt-0.5 font-medium text-slate-600">{trend}</p>
      </div>
    </div>
  );
}

/* ───────────────────────────── 3. BANDE RÉASSURANCE ───────────────────────────── */

function ReassuranceBand() {
  return (
    <section className="bg-gray-50 border-y border-gray-200 py-14 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-slate-500 uppercase tracking-wide">
          Ils font confiance à Operioz
        </p>

        {/* Fake brand logos — pure typography */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-6 items-center justify-items-center text-slate-400">
          <FakeLogo label="Plomberie Martin" />
          <FakeLogo label="Élec Pro Lyon" style="condensed" />
          <FakeLogo label="Chauffage Durand" style="serif" />
          <FakeLogo label="Rénov Bâti" style="bold" />
          <FakeLogo label="Multi Services Karim" />
        </div>

        {/* Counters */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Counter target={500} suffix="+" label="artisans actifs" />
          <Counter target={50000} suffix="+" label="devis générés" formatThousands />
          <Counter target={2} suffix="M€+" label="encaissés via Operioz" />
        </div>
      </div>
    </section>
  );
}

function FakeLogo({
  label,
  style = "default",
}: {
  label: string;
  style?: "default" | "condensed" | "serif" | "bold";
}) {
  const styleMap: Record<string, string> = {
    default: "font-sans tracking-tight",
    condensed: "font-sans tracking-tighter italic",
    serif: "font-serif tracking-normal",
    bold: "font-sans font-extrabold uppercase tracking-wide text-sm",
  };
  return (
    <span
      className={`text-lg sm:text-xl ${styleMap[style]} text-slate-400 hover:text-slate-600 transition-colors select-none`}
    >
      {label}
    </span>
  );
}

function Counter({
  target,
  suffix = "",
  label,
  formatThousands = false,
}: {
  target: number;
  suffix?: string;
  label: string;
  formatThousands?: boolean;
}) {
  const { ref, value } = useCountUp(target);
  const display = formatThousands
    ? value.toLocaleString("fr-FR")
    : value.toString();
  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent">
        {display}
        {suffix}
      </p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

/* ───────────────────────────── 4. FEATURES ───────────────────────────── */

const primaryFeatures = [
  {
    id: "devis",
    icon: FileText,
    eyebrow: "Devis & facturation",
    title: "Des devis pro en 2 minutes,\ndes factures conformes en 1 clic",
    description:
      "Composez vos devis avec votre bibliothèque d'articles métier (500+ références), transformez-les en factures, suivez les paiements et restez conforme à la facturation électronique 2026.",
    bullets: ["Bibliothèque articles métier", "Numérotation automatique", "Export FEC pour le comptable"],
    plan: "Inclus dans tous les plans",
    visual: "devis",
    accent: "blue",
  },
  {
    id: "clients",
    icon: Users,
    eyebrow: "Portail client & paiement",
    title: "Vos clients consultent et règlent\nleurs factures en ligne",
    description:
      "Un portail dédié pour chaque client avec ses devis, factures et l'historique des interventions. Paiement direct par carte bancaire via Stripe, sans frais cachés.",
    bullets: ["Portail client personnalisé", "Paiement Stripe intégré", "Relances automatiques"],
    plan: "Inclus à partir du plan Pro",
    visual: "client",
    accent: "indigo",
  },
  {
    id: "ia",
    icon: Sparkles,
    eyebrow: "Assistant IA",
    title: "Un assistant qui comprend\nvotre activité, jour après jour",
    description:
      "Analyses, prévisions de trésorerie, génération de devis assistée, suggestions de relances — l'IA Operioz lit votre activité en temps réel et vous fait gagner des heures chaque semaine.",
    bullets: ["Analyse photo + suggestion de devis", "Prévisions de trésorerie", "Relances intelligentes"],
    plan: "Inclus à partir du plan Pro",
    visual: "ia",
    accent: "violet",
  },
] as const;

const secondaryFeatures = [
  { icon: Users, title: "Gestion clients (CRM)", description: "Fichier complet avec historique, documents, notes.", plan: "Inclus" },
  { icon: Calendar, title: "Calendrier & planning", description: "Vue jour/semaine/mois, drag & drop des interventions.", plan: "Inclus" },
  { icon: MessageCircle, title: "Chat client", description: "Messagerie intégrée pour échanger sans quitter l'app.", plan: "Pro+" },
  { icon: MapPin, title: "Géolocalisation équipes", description: "Carte temps réel, affectation par proximité.", plan: "Entreprise" },
  { icon: ClipboardList, title: "Contrats de maintenance", description: "Récurrence automatique, facturation périodique.", plan: "Pro+" },
  { icon: ShieldCheck, title: "Conformité 2026", description: "Facturation électronique, export FEC, RGPD.", plan: "Inclus" },
] as const;

function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Fonctionnalités</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            Tout ce dont vous avez besoin,
            <br />
            <span className="text-slate-400">rien de superflu</span>
          </h2>
        </div>

        {/* Primary features — alternating */}
        <div className="space-y-20 sm:space-y-28">
          {primaryFeatures.map((f, i) => (
            <PrimaryFeatureRow key={f.id} feature={f} reverse={i % 2 === 1} />
          ))}
        </div>

        {/* Secondary features grid */}
        <div className="mt-24">
          <h3 className="text-center text-xl sm:text-2xl font-semibold text-slate-900 mb-10">
            Et bien plus encore
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {secondaryFeatures.map((f) => (
              <SecondaryFeatureCard key={f.title} feature={f} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimaryFeatureRow({
  feature,
  reverse,
}: {
  feature: (typeof primaryFeatures)[number];
  reverse: boolean;
}) {
  const { ref, isVisible } = useScrollReveal();
  const accentMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", grad: "from-blue-500 to-indigo-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200", grad: "from-indigo-500 to-violet-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", grad: "from-violet-500 to-fuchsia-600" },
  } as const;
  const a = accentMap[feature.accent];

  return (
    <div
      ref={ref}
      className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className={reverse ? "lg:order-2" : ""}>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${a.bg} ${a.text} ring-1 ${a.ring} text-xs font-semibold`}
        >
          <feature.icon className="h-3.5 w-3.5" />
          {feature.eyebrow}
        </span>
        <h3 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight whitespace-pre-line">
          {feature.title}
        </h3>
        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">{feature.description}</p>
        <ul className="mt-6 space-y-2">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className={`h-5 w-5 ${a.text} shrink-0`} />
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs font-medium text-slate-500">{feature.plan}</p>
      </div>

      <div className={reverse ? "lg:order-1" : ""}>
        <FeatureIllustration kind={feature.visual} gradient={a.grad} />
      </div>
    </div>
  );
}

function FeatureIllustration({
  kind,
  gradient,
}: {
  kind: "devis" | "client" | "ia";
  gradient: string;
}) {
  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-br ${gradient} p-6 sm:p-8 shadow-xl shadow-slate-200`}
    >
      <div className="absolute inset-0 opacity-20 rounded-2xl"
           style={{
             backgroundImage:
               "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
             backgroundSize: "24px 24px",
           }} />
      <div className="relative">
        {kind === "devis" && (
          <div className="rounded-xl bg-white shadow-lg p-4 sm:p-5 text-slate-900">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Devis #2026-042</p>
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-medium">
                Brouillon
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">SCI Les Terrasses du Rhône</p>
            <p className="text-xs text-slate-500">Lyon · 69002</p>
            <div className="mt-4 space-y-2">
              {[
                { label: "Pose chaudière gaz Frisquet 25kW", qty: "1", price: "2 400 €" },
                { label: "Tube cuivre Ø22, raccords", qty: "12", price: "480 €" },
                { label: "Main d'œuvre — Installation", qty: "8 h", price: "320 €" },
              ].map((l) => (
                <div key={l.label} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700 truncate pr-2">{l.label}</span>
                  <span className="text-slate-500 shrink-0">{l.qty}</span>
                  <span className="font-semibold text-slate-900 ml-3 shrink-0">{l.price}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">Total TTC</span>
              <span className="text-lg font-bold text-slate-900">3 200 €</span>
            </div>
          </div>
        )}

        {kind === "client" && (
          <div className="rounded-xl bg-white shadow-lg p-4 sm:p-5 text-slate-900">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Portail client</p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold">
                SM
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Sophie Martin</p>
                <p className="text-xs text-slate-500">sophie.martin@email.fr</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] text-slate-500 uppercase">À payer</p>
                <p className="text-base font-bold text-slate-900">1 240 €</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] text-slate-500 uppercase">Statut</p>
                <p className="text-base font-bold text-green-600">En cours</p>
              </div>
            </div>
            <button className="mt-4 w-full bg-slate-900 text-white text-xs font-semibold py-2.5 rounded-lg inline-flex items-center justify-center gap-2">
              <CreditCard className="h-4 w-4" />
              Régler en ligne · 1 240 €
            </button>
          </div>
        )}

        {kind === "ia" && (
          <div className="rounded-xl bg-white shadow-lg p-4 sm:p-5 text-slate-900">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              <p className="text-sm font-semibold">Assistant Operioz</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 mb-2">
              Comment va ma trésorerie ce mois-ci ?
            </div>
            <div className="rounded-lg bg-gradient-to-br from-violet-50 to-fuchsia-50 ring-1 ring-violet-100 px-3 py-2.5 text-xs text-slate-700 space-y-1.5">
              <p>
                Bonne semaine : <strong className="text-slate-900">12 450 €</strong> encaissés, dont 3 factures réglées via Stripe.
              </p>
              <p>
                ⚠️ <strong className="text-slate-900">2 factures</strong> en retard (Cabinet Médical, 1 850 €). Je peux envoyer une relance ?
              </p>
              <div className="flex gap-2 pt-1">
                <button className="px-2.5 py-1 rounded-md bg-violet-600 text-white text-[10px] font-semibold">
                  Relancer
                </button>
                <button className="px-2.5 py-1 rounded-md ring-1 ring-slate-200 text-[10px] font-medium">
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SecondaryFeatureCard({
  feature,
}: {
  feature: (typeof secondaryFeatures)[number];
}) {
  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="h-11 w-11 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
          <feature.icon className="h-5 w-5 text-blue-600" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {feature.plan}
        </span>
      </div>
      <h4 className="text-base font-semibold text-slate-900">{feature.title}</h4>
      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{feature.description}</p>
    </div>
  );
}

/* ───────────────────────────── 4b. SECTEURS D'ACTIVITÉ ───────────────────────────── */

const sectors = [
  {
    icon: Wrench,
    title: "Bâtiment & Rénovation",
    examples: "(plombier, électricien, maçon, carreleur, couvreur...)",
    tint: "bg-blue-50 text-blue-600 ring-blue-100",
  },
  {
    icon: Leaf,
    title: "Espaces verts & Extérieur",
    examples: "(jardinier, paysagiste, pisciniste, arboriste...)",
    tint: "bg-green-50 text-green-600 ring-green-100",
  },
  {
    icon: Sofa,
    title: "Aménagement intérieur",
    examples: "(cuisiniste, menuisier, peintre, décorateur, poseur...)",
    tint: "bg-amber-50 text-amber-600 ring-amber-100",
  },
  {
    icon: Truck,
    title: "Travaux publics & VRD",
    examples: "(terrassier, enrobeur, canalisateur, paveur...)",
    tint: "bg-orange-50 text-orange-600 ring-orange-100",
  },
  {
    icon: ShoppingBag,
    title: "Commerce & Services",
    examples: "(vendeur, prestataire, artisan commerçant, installateur...)",
    tint: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  {
    icon: Settings,
    title: "Maintenance & Dépannage",
    examples: "(technicien, réparateur, dépanneur, maintenancier...)",
    tint: "bg-cyan-50 text-cyan-600 ring-cyan-100",
  },
] as const;

function TradesSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-20 sm:py-28 bg-slate-50 border-y border-slate-200">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Secteurs</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            Adapté à votre secteur d'activité
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600">
            Operioz s'adapte à tous les professionnels indépendants, quel que soit votre métier.
          </p>
        </div>

        <div
          className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {sectors.map((s) => (
            <div
              key={s.title}
              className="group bg-white rounded-xl ring-1 ring-slate-200 p-6 hover:ring-blue-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              <div
                className={`h-12 w-12 rounded-lg ring-1 flex items-center justify-center ${s.tint}`}
              >
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm italic text-slate-500 leading-relaxed">
                {s.examples}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 5. COMMENT ÇA MARCHE ───────────────────────────── */

function HowItWorksSection() {
  const { ref, isVisible } = useScrollReveal();
  const steps = [
    {
      num: "01",
      icon: UserPlus,
      title: "Créez votre compte",
      description: "Inscription en 2 minutes, sans carte bancaire. Aucune installation.",
    },
    {
      num: "02",
      icon: Settings,
      title: "Configurez votre activité",
      description: "Importez vos clients, choisissez votre bibliothèque métier, personnalisez vos documents.",
    },
    {
      num: "03",
      icon: TrendingUp,
      title: "Développez votre business",
      description: "Envoyez devis, facturez, encaissez en ligne, pilotez avec l'assistant IA.",
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-gradient-to-b from-blue-50/50 to-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Démarrage</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            Opérationnel en 3 étapes
          </h2>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent" />

          <div
            className={`grid gap-10 md:grid-cols-3 max-w-5xl mx-auto transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {steps.map((step) => (
              <div key={step.num} className="text-center relative">
                <div className="inline-flex items-center justify-center mb-5 relative">
                  <div className="h-24 w-24 rounded-full bg-white shadow-lg ring-1 ring-blue-100 flex items-center justify-center">
                    <step.icon className="h-9 w-9 text-blue-600" />
                  </div>
                  <span className="absolute -top-2 -right-2 inline-flex items-center justify-center h-10 px-3 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md">
                    {step.num}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600 max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 6. PRICING ───────────────────────────── */

type BillingCycle = "monthly" | "annual";

const plans = [
  {
    name: "Essentiel",
    monthly: 29,
    tagline: "Parfait pour démarrer",
    popular: false,
    cta: "Essayer Essentiel",
    accent: "slate",
    features: [
      "Devis & factures illimités",
      "Gestion clients (jusqu'à 100)",
      "Calendrier & planification",
      "Bibliothèque articles métier",
      "Tableau de bord",
      "Export comptable FEC",
      "Support email",
    ],
  },
  {
    name: "Pro",
    monthly: 49,
    tagline: "Le choix des artisans qui développent",
    popular: true,
    cta: "Démarrer avec Pro",
    accent: "blue",
    features: [
      "Tout Essentiel +",
      "Clients illimités",
      "Assistant IA",
      "Portail client",
      "Paiement en ligne Stripe",
      "Chat client intégré",
      "Contrats de maintenance",
      "Notifications temps réel",
      "Support prioritaire",
    ],
  },
  {
    name: "Entreprise",
    monthly: 79,
    tagline: "Pour les équipes et multi-métiers",
    popular: false,
    cta: "Choisir Entreprise",
    accent: "indigo",
    features: [
      "Tout Pro +",
      "Multi-utilisateurs (jusqu'à 10)",
      "Gestion techniciens",
      "Géolocalisation équipes",
      "Bons de commande fournisseurs",
      "Rapports avancés",
      "API & intégrations",
      "Support téléphonique dédié",
    ],
  },
] as const;

function PricingSection() {
  const { ref, isVisible } = useScrollReveal();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const priceFor = (monthly: number) =>
    cycle === "annual" ? Math.round(monthly * 0.8) : monthly;

  return (
    <section id="tarifs" className="py-20 sm:py-28 bg-slate-50">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Tarifs</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            Des tarifs simples et transparents
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600">
            30 jours d'essai gratuit sur toutes les offres — Sans engagement.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex items-center bg-white rounded-full p-1 ring-1 ring-slate-200 shadow-sm">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                cycle === "monthly"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setCycle("annual")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                cycle === "annual"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Annuel
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                −20%
              </span>
            </button>
          </div>
        </div>

        <div
          className={`grid gap-6 lg:gap-8 md:grid-cols-3 max-w-6xl mx-auto items-stretch transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} price={priceFor(plan.monthly)} cycle={cycle} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-600 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 w-full">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> 30 jours gratuits
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> Sans carte bancaire
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> Résiliation en 1 clic
          </span>
        </p>
      </div>
    </section>
  );
}

function PricingCard({
  plan,
  price,
  cycle,
}: {
  plan: (typeof plans)[number];
  price: number;
  cycle: BillingCycle;
}) {
  const isPro = plan.popular;
  const ringClass = isPro
    ? "ring-2 ring-blue-500 shadow-2xl shadow-blue-200/60 md:-translate-y-2"
    : "ring-1 ring-slate-200 shadow-sm";
  const ctaClass = isPro
    ? "bg-blue-600 hover:bg-blue-700 text-white"
    : plan.accent === "indigo"
    ? "bg-slate-900 hover:bg-slate-800 text-white"
    : "bg-white hover:bg-slate-50 text-slate-900 ring-1 ring-slate-300";

  return (
    <div
      className={`relative rounded-2xl bg-white p-8 flex flex-col transition-transform ${ringClass}`}
    >
      {isPro && (
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-1.5 rounded-full overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(110deg, #2563eb 25%, #60a5fa 50%, #2563eb 75%)",
            backgroundSize: "200% auto",
            animation: "shimmer 3.5s linear infinite",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Recommandé
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
        <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-5xl font-bold text-slate-900">{price}€</span>
          <span className="text-slate-500">/mois</span>
        </div>
        {cycle === "annual" && (
          <p className="mt-1.5 text-xs text-green-700 font-medium">
            Facturé annuellement · {price * 12}€/an
          </p>
        )}
        {cycle === "monthly" && (
          <p className="mt-1.5 text-xs text-slate-500">Facturation mensuelle, sans engagement</p>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-slate-700">
            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${isPro ? "text-blue-600" : "text-slate-500"}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button asChild className={`w-full py-6 font-semibold ${ctaClass}`}>
        <a href="/signup">{plan.cta}</a>
      </Button>
    </div>
  );
}

/* ───────────────────────────── 7. TÉMOIGNAGES ───────────────────────────── */

const testimonials = [
  {
    initials: "MD",
    name: "Marc Dubois",
    role: "Plombier — Lyon",
    color: "from-blue-500 to-indigo-600",
    rating: 5,
    reviews: 47,
    text: "Depuis Operioz, je génère mes devis en 3 minutes au lieu de 30. J'ai réduit mes impayés de 60% grâce aux relances automatiques. L'app paie largement son abonnement chaque mois.",
  },
  {
    initials: "SM",
    name: "Sophie Martin",
    role: "Paysagiste — Bordeaux",
    color: "from-indigo-500 to-violet-600",
    rating: 5,
    reviews: 31,
    text: "Depuis Operioz, j'envoie mes devis d'aménagement depuis mon téléphone sur le chantier. Mes clients reçoivent tout en temps réel et paient en ligne. Un gain de temps énorme.",
  },
  {
    initials: "KB",
    name: "Karim Benali",
    role: "Cuisiniste — Lyon",
    color: "from-violet-500 to-fuchsia-600",
    rating: 5,
    reviews: 22,
    text: "Je gère mes commandes fournisseurs, mes clients et mon planning depuis une seule app. J'ai gagné 5 h par semaine sur l'administratif.",
  },
];

function TestimonialsSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      id="temoignages"
      className="relative py-20 sm:py-28 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white overflow-hidden"
    >
      {/* Soft glow */}
      <div className="absolute -top-32 left-1/3 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl" />

      <div ref={ref} className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-300 uppercase tracking-wide">Témoignages</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Ils nous font confiance
          </h2>
          <p className="mt-4 text-slate-300">
            Des artisans qui ont digitalisé leur activité avec Operioz.
          </p>
        </div>

        <div
          className={`grid gap-6 md:grid-cols-3 items-stretch transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {testimonials.map((t, i) => {
            const rotations = ["-rotate-1", "rotate-0", "rotate-1"];
            return (
              <div
                key={t.name}
                className={`relative bg-white/5 backdrop-blur-sm ring-1 ring-white/10 rounded-2xl p-6 hover:ring-white/20 hover:bg-white/[0.07] transition-all duration-300 ${rotations[i]} hover:rotate-0 flex flex-col`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-4 w-4 ${s <= t.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-600"}`}
                    />
                  ))}
                  <span className="text-xs text-slate-400 ml-1">· {t.reviews} avis</span>
                </div>
                <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed flex-1">
                  "{t.text}"
                </p>
                <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
                  <div
                    className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold shadow-md`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 8. FAQ ───────────────────────────── */

const faqItems = [
  {
    question: "Est-ce adapté à mon métier ?",
    answer:
      "Operioz est conçu pour les plombiers, électriciens, chauffagistes, climaticiens et artisans multi-métiers. Chaque métier dispose de sa propre bibliothèque d'articles avec plus de 300 références prêtes à l'emploi.",
  },
  {
    question: "Puis-je importer mes clients existants ?",
    answer:
      "Oui, vous pouvez importer votre fichier clients au format CSV en quelques clics. Toutes les données sont conservées : coordonnées, historique, notes.",
  },
  {
    question: "Comment fonctionne l'essai gratuit ?",
    answer:
      "L'essai gratuit dure 30 jours avec accès complet à toutes les fonctionnalités. Aucune carte bancaire n'est requise. À la fin de l'essai, vous choisissez l'offre qui vous convient — ou rien du tout.",
  },
  {
    question: "Mes données sont-elles sécurisées ?",
    answer:
      "Vos données sont hébergées sur des serveurs européens avec chiffrement SSL, sauvegardes quotidiennes et conformité RGPD. Vous restez propriétaire de vos données et pouvez les exporter à tout moment.",
  },
  {
    question: "Puis-je annuler à tout moment ?",
    answer:
      "Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis votre espace. Vos données restent accessibles pendant 30 jours après résiliation pour vous laisser le temps d'exporter ce qui vous est utile.",
  },
  {
    question: "La facturation électronique 2026, c'est quoi ?",
    answer:
      "À partir de 2026, toutes les entreprises françaises devront émettre et recevoir des factures au format électronique. Operioz est déjà conforme avec la génération de factures aux normes et l'export FEC pour votre comptable.",
  },
  {
    question: "L'application fonctionne-t-elle hors ligne ?",
    answer:
      "Operioz est une application web PWA : les pages déjà visitées restent accessibles sans connexion, et toute modification est synchronisée automatiquement dès que le réseau revient.",
  },
  {
    question: "Y a-t-il une application mobile ?",
    answer:
      "Operioz est une PWA installable depuis votre navigateur sur iOS et Android — vous obtenez une icône sur votre écran d'accueil et l'expérience d'une vraie app, sans passer par les stores. Aucune installation lourde.",
  },
  {
    question: "Puis-je utiliser l'application sur mon téléphone ?",
    answer:
      "Oui, Operioz est entièrement responsive et fonctionne parfaitement sur smartphone et tablette. La majorité des artisans utilisent l'app autant sur le chantier que depuis leur bureau.",
  },
];

function FAQSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <div ref={ref} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">FAQ</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            Questions fréquentes
          </h2>
        </div>

        <div
          className={`transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <Accordion
            type="single"
            collapsible
            className="bg-slate-50 rounded-2xl ring-1 ring-slate-200 divide-y divide-slate-200 overflow-hidden"
          >
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-0 px-6">
                <AccordionTrigger className="text-left text-slate-900 font-medium hover:no-underline py-5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 leading-relaxed pb-5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Une autre question ?{" "}
          <a href="mailto:contact@operioz.com" className="text-blue-600 hover:text-blue-700 font-medium">
            contact@operioz.com
          </a>
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────────── 9. CTA FINAL ───────────────────────────── */

function FinalCTASection() {
  return (
    <section className="relative py-20 sm:py-28 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white overflow-hidden">
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full bg-blue-500/20 blur-3xl" />
      <div
        className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl"
        style={{ animation: "float-slow 16s ease-in-out infinite" }}
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
          Rejoignez <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">500+ professionnels</span> qui ont digitalisé leur activité
        </h2>
        <p className="mt-5 text-lg text-slate-300 max-w-2xl mx-auto">
          30 jours gratuits · sans engagement · sans carte bancaire.
        </p>

        <div className="mt-10 relative inline-block">
          <Button
            size="lg"
            asChild
            className="relative bg-white text-slate-900 hover:bg-blue-50 text-base sm:text-lg px-10 py-7 shadow-2xl shadow-blue-900/40 font-semibold group overflow-hidden"
          >
            <a href="/signup" className="inline-flex items-center gap-2">
              Créer mon compte gratuitement
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full opacity-60"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
                  animation: "shine 3.2s ease-in-out infinite",
                }}
              />
            </a>
          </Button>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
          {[
            { icon: Lock, label: "Données sécurisées", sub: "Hébergement EU, RGPD" },
            { icon: Zap, label: "Opérationnel en 5 min", sub: "Aucune installation" },
            { icon: Phone, label: "Support réactif", sub: "Réponse sous 24 h" },
          ].map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-2 text-center">
              <div className="h-11 w-11 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
                <r.icon className="h-5 w-5 text-blue-300" />
              </div>
              <p className="text-sm font-semibold text-white">{r.label}</p>
              <p className="text-xs text-slate-400">{r.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 10. FOOTER ───────────────────────────── */

function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <a href="/" className="inline-flex items-center gap-2 mb-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <Wrench className="h-5 w-5 text-white" />
              </span>
              <span className="text-lg font-bold text-white">Operioz</span>
            </a>
            <p className="text-sm text-slate-400 leading-relaxed">
              Le logiciel de gestion tout-en-un pour les artisans, indépendants et professionnels du terrain.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {[
                { Icon: Linkedin, label: "LinkedIn" },
                { Icon: Facebook, label: "Facebook" },
                { Icon: Instagram, label: "Instagram" },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Produit */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Produit</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => scrollTo("fonctionnalites")} className="text-sm text-slate-400 hover:text-white transition-colors">
                  Fonctionnalités
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("tarifs")} className="text-sm text-slate-400 hover:text-white transition-colors">
                  Tarifs
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("temoignages")} className="text-sm text-slate-400 hover:text-white transition-colors">
                  Témoignages
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("faq")} className="text-sm text-slate-400 hover:text-white transition-colors">
                  FAQ
                </button>
              </li>
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Ressources</h4>
            <ul className="space-y-2">
              <li>
                <a href="/guide" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Guide d'utilisation
                </a>
              </li>
              <li>
                <span className="text-sm text-slate-500">
                  Blog <span className="text-xs">(bientôt)</span>
                </span>
              </li>
              <li>
                <a href="/aide" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Centre d'aide
                </a>
              </li>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Légal</h4>
            <ul className="space-y-2">
              <li>
                <a href="/mentions-legales" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Mentions légales
                </a>
              </li>
              <li>
                <a href="/cgu" className="text-sm text-slate-400 hover:text-white transition-colors">
                  CGU
                </a>
              </li>
              <li>
                <a href="/cgv" className="text-sm text-slate-400 hover:text-white transition-colors">
                  CGV
                </a>
              </li>
              <li>
                <a href="/confidentialite" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Politique de confidentialité
                </a>
              </li>
              <li>
                <a
                  href="mailto:contact@operioz.com"
                  className="text-sm text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  contact@operioz.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Operioz. Tous droits réservés.
          </p>
          <p className="text-xs text-slate-500">
            Fait avec ❤ en France · Pour tous les professionnels 🇫🇷
          </p>
        </div>
      </div>
    </footer>
  );
}
