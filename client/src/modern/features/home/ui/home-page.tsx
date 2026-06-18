import { Button } from "@/modern/shared/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/modern/shared/ui/accordion";
import {
  FileText,
  Users,
  Calendar,
  ArrowRight,
  Wrench,
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
import { useTranslation } from "react-i18next";
import { CookieBanner } from "./cookie-banner";
import { useHomeAuth } from "../application/use-home-auth";
import { priceFor, type BillingCycle } from "../domain/home";

// Page vitrine publique (`/v2/home`, legacy `/`) — port clean-archi : routing TanStack (montée publique),
// auth via le client tRPC neuf (`use-home-auth`), i18n react-i18next (namespace `home`). Markup/classes
// Tailwind conservés à l'identique (parité visuelle stricte). Données 100% statiques.

/* ───────────────────────────── KEYFRAMES (inline) ───────────────────────────── */
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

/* Tableaux STRUCTURELS (icônes / accents / valeurs numériques) — zippés par index avec les textes i18n. */
const NAV_IDS = ["fonctionnalites", "tarifs", "temoignages", "faq"] as const;
const PRIMARY_META = [
  { icon: FileText, visual: "devis" as const, accent: "blue" as const },
  { icon: Users, visual: "client" as const, accent: "indigo" as const },
  { icon: Sparkles, visual: "ia" as const, accent: "violet" as const },
];
const SECONDARY_ICONS = [Users, Calendar, MessageCircle, MapPin, ClipboardList, ShieldCheck];
const SECTOR_META = [
  { icon: Wrench, tint: "bg-blue-50 text-blue-600 ring-blue-100" },
  { icon: Leaf, tint: "bg-green-50 text-green-600 ring-green-100" },
  { icon: Sofa, tint: "bg-amber-50 text-amber-600 ring-amber-100" },
  { icon: Truck, tint: "bg-orange-50 text-orange-600 ring-orange-100" },
  { icon: ShoppingBag, tint: "bg-violet-50 text-violet-600 ring-violet-100" },
  { icon: Settings, tint: "bg-cyan-50 text-cyan-600 ring-cyan-100" },
];
const STEP_META = [
  { num: "01", icon: UserPlus },
  { num: "02", icon: Settings },
  { num: "03", icon: TrendingUp },
];
const PLAN_META = [
  { monthly: 29, popular: false, accent: "slate" as const },
  { monthly: 49, popular: true, accent: "blue" as const },
  { monthly: 89, popular: false, accent: "indigo" as const },
];
const TESTIMONIAL_META = [
  { initials: "MD", color: "from-blue-500 to-indigo-600", rating: 5, reviews: 47 },
  { initials: "SM", color: "from-indigo-500 to-violet-600", rating: 5, reviews: 31 },
  { initials: "KB", color: "from-violet-500 to-fuchsia-600", rating: 5, reviews: 22 },
];
const CTA_ICONS = [Lock, Zap, Phone];
const ROW_TONES = [
  "bg-amber-50 text-amber-700 ring-amber-200",
  "bg-green-50 text-green-700 ring-green-200",
  "bg-blue-50 text-blue-700 ring-blue-200",
];

/* ───────────────────────────── ROOT ───────────────────────────── */

export default function HomePage() {
  const { isAuthenticated, loading } = useHomeAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !loading) {
      // Redirection vers l'espace authentifié (hors arbre TanStack public) → navigation pleine page.
      window.location.replace("/dashboard");
    }
  }, [isAuthenticated, loading]);

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
  const { t } = useTranslation("home");
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
            <span className="text-xl font-bold tracking-tight text-slate-900">{t("brand")}</span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_IDS.map((id) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {t(`nav.${id}`)}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" asChild className="text-slate-700 hover:text-slate-900">
              <a href="/sign-in">{t("seConnecter")}</a>
            </Button>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow group">
              <a href="/signup" className="inline-flex items-center gap-1.5">
                {t("essaiGratuit")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
          </div>

          <button
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={t("menu")}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 space-y-3">
          {NAV_IDS.map((id) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="block w-full text-left py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t(`nav.${id}`)}
            </button>
          ))}
          <div className="pt-3 border-t border-gray-200 flex flex-col gap-2">
            <Button variant="outline" asChild className="w-full">
              <a href="/sign-in">{t("seConnecter")}</a>
            </Button>
            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
              <a href="/signup">{t("essaiGratuit")}</a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ───────────────────────────── 2. HERO ───────────────────────────── */

function HeroSection() {
  const { t } = useTranslation("home");
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
            <span>{t("hero.badge")}</span>
          </div>

          {/* Title */}
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            {t("hero.title1")}
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              {t("hero.title2")}
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            {t("hero.subtitle")}
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="bg-blue-600 hover:bg-blue-500 text-base px-8 py-6 w-full sm:w-auto shadow-lg shadow-blue-900/40 group"
            >
              <a href="/signup" className="inline-flex items-center gap-2">
                {t("hero.ctaPrimary")}
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
                {t("hero.ctaDemo")}
              </a>
            </Button>
          </div>

          {/* Trust strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs sm:text-sm text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <strong className="text-white font-semibold">4.9/5</strong> {t("hero.trustSatisfaction")}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-blue-300" />
              {t("hero.trustSecure")}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              {t("hero.trustNoCommit")}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-500 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-blue-300" />
              {t("hero.trustMobile")}
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
  const { t } = useTranslation("home");
  const sidebar = t("mockup.sidebar", { returnObjects: true }) as string[];
  const rows = t("mockup.rows", { returnObjects: true }) as Array<{ ref: string; client: string; city: string; amount: string; status: string }>;
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
          {t("mockup.url")}
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
            <span className="font-bold text-sm text-slate-900">{t("brand")}</span>
          </div>
          <ul className="space-y-1">
            {sidebar.map((label, idx) => (
              <li
                key={label}
                className={`px-2.5 py-2 rounded-md ${
                  idx === 0
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-600"
                }`}
              >
                {label}
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="col-span-12 sm:col-span-9 p-4 sm:p-6 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">{t("mockup.hello")}</p>
              <p className="text-sm font-semibold text-slate-900">{t("mockup.activity")}</p>
            </div>
            <span className="px-2.5 py-1 text-[10px] rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 font-medium">
              {t("mockup.online")}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t("mockup.statCaLabel")} value={t("mockup.statCaValue")} trend={t("mockup.statCaTrend")} tone="blue" />
            <StatTile label={t("mockup.statDevisLabel")} value={t("mockup.statDevisValue")} trend={t("mockup.statDevisTrend")} tone="violet" />
            <StatTile label={t("mockup.statEncaissLabel")} value={t("mockup.statEncaissValue")} trend={t("mockup.statEncaissTrend")} tone="green" />
          </div>

          {/* Recent devis */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">{t("mockup.devisRecents")}</p>
              <p className="text-[10px] text-slate-500">{t("mockup.voirTout")}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((d, idx) => (
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
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${ROW_TONES[idx]}`}>
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
  const { t } = useTranslation("home");
  const logos = t("reassurance.logos", { returnObjects: true }) as string[];
  const logoStyles = ["default", "condensed", "serif", "bold", "default"] as const;
  return (
    <section className="bg-gray-50 border-y border-gray-200 py-14 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-slate-500 uppercase tracking-wide">
          {t("reassurance.trust")}
        </p>

        {/* Fake brand logos — pure typography */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-6 items-center justify-items-center text-slate-400">
          {logos.map((label, idx) => (
            <FakeLogo key={label} label={label} style={logoStyles[idx]} />
          ))}
        </div>

        {/* Counters */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Counter target={500} suffix="+" label={t("reassurance.counterArtisans")} />
          <Counter target={50000} suffix="+" label={t("reassurance.counterDevis")} formatThousands />
          <Counter target={2} suffix="M€+" label={t("reassurance.counterEncaisse")} />
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

type PrimaryFeatureText = { eyebrow: string; title: string; description: string; bullets: string[]; plan: string };

function FeaturesSection() {
  const { t } = useTranslation("home");
  const primary = t("features.primary", { returnObjects: true }) as PrimaryFeatureText[];
  const secondary = t("features.secondary", { returnObjects: true }) as Array<{ title: string; description: string; plan: string }>;
  return (
    <section id="fonctionnalites" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">{t("features.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            {t("features.title1")}
            <br />
            <span className="text-slate-400">{t("features.title2")}</span>
          </h2>
        </div>

        {/* Primary features — alternating */}
        <div className="space-y-20 sm:space-y-28">
          {primary.map((f, i) => (
            <PrimaryFeatureRow key={i} text={f} meta={PRIMARY_META[i]} reverse={i % 2 === 1} />
          ))}
        </div>

        {/* Secondary features grid */}
        <div className="mt-24">
          <h3 className="text-center text-xl sm:text-2xl font-semibold text-slate-900 mb-10">
            {t("features.secondaryTitle")}
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {secondary.map((f, i) => (
              <SecondaryFeatureCard key={f.title} text={f} Icon={SECONDARY_ICONS[i]} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimaryFeatureRow({
  text,
  meta,
  reverse,
}: {
  text: PrimaryFeatureText;
  meta: { icon: typeof FileText; visual: "devis" | "client" | "ia"; accent: "blue" | "indigo" | "violet" };
  reverse: boolean;
}) {
  const { ref, isVisible } = useScrollReveal();
  const accentMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", grad: "from-blue-500 to-indigo-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200", grad: "from-indigo-500 to-violet-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", grad: "from-violet-500 to-fuchsia-600" },
  } as const;
  const a = accentMap[meta.accent];
  const Icon = meta.icon;

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
          <Icon className="h-3.5 w-3.5" />
          {text.eyebrow}
        </span>
        <h3 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight whitespace-pre-line">
          {text.title}
        </h3>
        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">{text.description}</p>
        <ul className="mt-6 space-y-2">
          {text.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className={`h-5 w-5 ${a.text} shrink-0`} />
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs font-medium text-slate-500">{text.plan}</p>
      </div>

      <div className={reverse ? "lg:order-1" : ""}>
        <FeatureIllustration kind={meta.visual} gradient={a.grad} />
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
  const { t } = useTranslation("home");
  const devisLines = t("illustrations.devisLines", { returnObjects: true }) as Array<{ label: string; qty: string; price: string }>;
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
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("illustrations.devisTitle")}</p>
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-medium">
                {t("illustrations.devisBadge")}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">{t("illustrations.devisClient")}</p>
            <p className="text-xs text-slate-500">{t("illustrations.devisCity")}</p>
            <div className="mt-4 space-y-2">
              {devisLines.map((l) => (
                <div key={l.label} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700 truncate pr-2">{l.label}</span>
                  <span className="text-slate-500 shrink-0">{l.qty}</span>
                  <span className="font-semibold text-slate-900 ml-3 shrink-0">{l.price}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">{t("illustrations.devisTotalLabel")}</span>
              <span className="text-lg font-bold text-slate-900">{t("illustrations.devisTotal")}</span>
            </div>
          </div>
        )}

        {kind === "client" && (
          <div className="rounded-xl bg-white shadow-lg p-4 sm:p-5 text-slate-900">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t("illustrations.clientTitle")}</p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold">
                {t("illustrations.clientInitials")}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{t("illustrations.clientName")}</p>
                <p className="text-xs text-slate-500">{t("illustrations.clientEmail")}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] text-slate-500 uppercase">{t("illustrations.clientAPayer")}</p>
                <p className="text-base font-bold text-slate-900">{t("illustrations.clientAPayerValue")}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] text-slate-500 uppercase">{t("illustrations.clientStatut")}</p>
                <p className="text-base font-bold text-green-600">{t("illustrations.clientStatutValue")}</p>
              </div>
            </div>
            <button className="mt-4 w-full bg-slate-900 text-white text-xs font-semibold py-2.5 rounded-lg inline-flex items-center justify-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t("illustrations.clientRegler")}
            </button>
          </div>
        )}

        {kind === "ia" && (
          <div className="rounded-xl bg-white shadow-lg p-4 sm:p-5 text-slate-900">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              <p className="text-sm font-semibold">{t("illustrations.iaTitle")}</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 mb-2">
              {t("illustrations.iaQuestion")}
            </div>
            <div className="rounded-lg bg-gradient-to-br from-violet-50 to-fuchsia-50 ring-1 ring-violet-100 px-3 py-2.5 text-xs text-slate-700 space-y-1.5">
              <p>
                {t("illustrations.iaAnswer1Pre")}<strong className="text-slate-900">{t("illustrations.iaAnswer1Strong")}</strong>{t("illustrations.iaAnswer1Post")}
              </p>
              <p>
                ⚠️ <strong className="text-slate-900">{t("illustrations.iaAnswer2Strong")}</strong>{t("illustrations.iaAnswer2Post")}
              </p>
              <div className="flex gap-2 pt-1">
                <button className="px-2.5 py-1 rounded-md bg-violet-600 text-white text-[10px] font-semibold">
                  {t("illustrations.iaRelancer")}
                </button>
                <button className="px-2.5 py-1 rounded-md ring-1 ring-slate-200 text-[10px] font-medium">
                  {t("illustrations.iaPlusTard")}
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
  text,
  Icon,
}: {
  text: { title: string; description: string; plan: string };
  Icon: typeof FileText;
}) {
  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="h-11 w-11 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {text.plan}
        </span>
      </div>
      <h4 className="text-base font-semibold text-slate-900">{text.title}</h4>
      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{text.description}</p>
    </div>
  );
}

/* ───────────────────────────── 4b. SECTEURS D'ACTIVITÉ ───────────────────────────── */

function TradesSection() {
  const { t } = useTranslation("home");
  const { ref, isVisible } = useScrollReveal();
  const items = t("sectors.items", { returnObjects: true }) as Array<{ title: string; examples: string }>;

  return (
    <section className="py-20 sm:py-28 bg-slate-50 border-y border-slate-200">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">{t("sectors.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            {t("sectors.title")}
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600">
            {t("sectors.subtitle")}
          </p>
        </div>

        <div
          className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {items.map((s, i) => {
            const Icon = SECTOR_META[i].icon;
            return (
              <div
                key={s.title}
                className="group bg-white rounded-xl ring-1 ring-slate-200 p-6 hover:ring-blue-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div
                  className={`h-12 w-12 rounded-lg ring-1 flex items-center justify-center ${SECTOR_META[i].tint}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm italic text-slate-500 leading-relaxed">
                  {s.examples}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 5. COMMENT ÇA MARCHE ───────────────────────────── */

function HowItWorksSection() {
  const { t } = useTranslation("home");
  const { ref, isVisible } = useScrollReveal();
  const steps = t("how.steps", { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section className="py-20 sm:py-28 bg-gradient-to-b from-blue-50/50 to-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">{t("how.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            {t("how.title")}
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
            {steps.map((step, i) => {
              const Icon = STEP_META[i].icon;
              return (
                <div key={STEP_META[i].num} className="text-center relative">
                  <div className="inline-flex items-center justify-center mb-5 relative">
                    <div className="h-24 w-24 rounded-full bg-white shadow-lg ring-1 ring-blue-100 flex items-center justify-center">
                      <Icon className="h-9 w-9 text-blue-600" />
                    </div>
                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center h-10 px-3 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md">
                      {STEP_META[i].num}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 max-w-xs mx-auto">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 6. PRICING ───────────────────────────── */

type PlanText = { name: string; tagline: string; cta: string; features: string[] };

function PricingSection() {
  const { t } = useTranslation("home");
  const { ref, isVisible } = useScrollReveal();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const plansText = t("pricing.plans", { returnObjects: true }) as PlanText[];

  return (
    <section id="tarifs" className="py-20 sm:py-28 bg-slate-50">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">{t("pricing.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            {t("pricing.title")}
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600">
            {t("pricing.subtitle")}
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
              {t("pricing.monthly")}
            </button>
            <button
              onClick={() => setCycle("annual")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                cycle === "annual"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t("pricing.annual")}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                {t("pricing.discount")}
              </span>
            </button>
          </div>
        </div>

        <div
          className={`grid gap-6 lg:gap-8 md:grid-cols-3 max-w-6xl mx-auto items-stretch transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {plansText.map((plan, i) => (
            <PricingCard key={plan.name} plan={plan} meta={PLAN_META[i]} price={priceFor(PLAN_META[i].monthly, cycle)} cycle={cycle} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-600 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 w-full">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> {t("pricing.footerFree")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> {t("pricing.footerNoCard")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-600" /> {t("pricing.footerCancel")}
          </span>
        </p>
      </div>
    </section>
  );
}

function PricingCard({
  plan,
  meta,
  price,
  cycle,
}: {
  plan: PlanText;
  meta: { monthly: number; popular: boolean; accent: "slate" | "blue" | "indigo" };
  price: number;
  cycle: BillingCycle;
}) {
  const { t } = useTranslation("home");
  const isPro = meta.popular;
  const ringClass = isPro
    ? "ring-2 ring-blue-500 shadow-2xl shadow-blue-200/60 md:-translate-y-2"
    : "ring-1 ring-slate-200 shadow-sm";
  const ctaClass = isPro
    ? "bg-blue-600 hover:bg-blue-700 text-white"
    : meta.accent === "indigo"
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
          {t("pricing.recommended")}
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
        <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-5xl font-bold text-slate-900">{price}€</span>
          <span className="text-slate-500">{t("pricing.perMonth")}</span>
        </div>
        {cycle === "annual" && (
          <p className="mt-1.5 text-xs text-green-700 font-medium">
            {t("pricing.billedAnnually", { total: price * 12 })}
          </p>
        )}
        {cycle === "monthly" && (
          <p className="mt-1.5 text-xs text-slate-500">{t("pricing.billedMonthly")}</p>
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

function TestimonialsSection() {
  const { t } = useTranslation("home");
  const { ref, isVisible } = useScrollReveal();
  const items = t("testimonials.items", { returnObjects: true }) as Array<{ name: string; role: string; text: string }>;

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
          <p className="text-sm font-semibold text-blue-300 uppercase tracking-wide">{t("testimonials.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            {t("testimonials.title")}
          </h2>
          <p className="mt-4 text-slate-300">
            {t("testimonials.subtitle")}
          </p>
        </div>

        <div
          className={`grid gap-6 md:grid-cols-3 items-stretch transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {items.map((item, i) => {
            const meta = TESTIMONIAL_META[i];
            const rotations = ["-rotate-1", "rotate-0", "rotate-1"];
            return (
              <div
                key={item.name}
                className={`relative bg-white/5 backdrop-blur-sm ring-1 ring-white/10 rounded-2xl p-6 hover:ring-white/20 hover:bg-white/[0.07] transition-all duration-300 ${rotations[i]} hover:rotate-0 flex flex-col`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-4 w-4 ${s <= meta.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-600"}`}
                    />
                  ))}
                  <span className="text-xs text-slate-400 ml-1">· {meta.reviews} {t("testimonials.reviewsSuffix")}</span>
                </div>
                <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed flex-1">
                  "{item.text}"
                </p>
                <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
                  <div
                    className={`h-10 w-10 rounded-full bg-gradient-to-br ${meta.color} flex items-center justify-center text-white text-sm font-bold shadow-md`}
                  >
                    {meta.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.role}</p>
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

function FAQSection() {
  const { t } = useTranslation("home");
  const { ref, isVisible } = useScrollReveal();
  const items = t("faq.items", { returnObjects: true }) as Array<{ question: string; answer: string }>;

  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <div ref={ref} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">{t("faq.eyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
            {t("faq.title")}
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
            {items.map((item, i) => (
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
          {t("faq.more")}{" "}
          <a href="mailto:contact@operioz.com" className="text-blue-600 hover:text-blue-700 font-medium">
            {t("faq.email")}
          </a>
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────────── 9. CTA FINAL ───────────────────────────── */

function FinalCTASection() {
  const { t } = useTranslation("home");
  const reassurance = t("cta.reassurance", { returnObjects: true }) as Array<{ label: string; sub: string }>;
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
          {t("cta.title1")}<span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">{t("cta.title2")}</span>{t("cta.title3")}
        </h2>
        <p className="mt-5 text-lg text-slate-300 max-w-2xl mx-auto">
          {t("cta.subtitle")}
        </p>

        <div className="mt-10 relative inline-block">
          <Button
            size="lg"
            asChild
            className="relative bg-white text-slate-900 hover:bg-blue-50 text-base sm:text-lg px-10 py-7 shadow-2xl shadow-blue-900/40 font-semibold group overflow-hidden"
          >
            <a href="/signup" className="inline-flex items-center gap-2">
              {t("cta.button")}
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
          {reassurance.map((r, i) => {
            const Icon = CTA_ICONS[i];
            return (
              <div key={r.label} className="flex flex-col items-center gap-2 text-center">
                <div className="h-11 w-11 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-blue-300" />
                </div>
                <p className="text-sm font-semibold text-white">{r.label}</p>
                <p className="text-xs text-slate-400">{r.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 10. FOOTER ───────────────────────────── */

function Footer() {
  const { t } = useTranslation("home");
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
              <span className="text-lg font-bold text-white">{t("brand")}</span>
            </a>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t("footer.tagline")}
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
            <h4 className="text-sm font-semibold text-white mb-4">{t("footer.produit")}</h4>
            <ul className="space-y-2">
              {NAV_IDS.map((id) => (
                <li key={id}>
                  <button onClick={() => scrollTo(id)} className="text-sm text-slate-400 hover:text-white transition-colors">
                    {t(`nav.${id}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t("footer.ressources")}</h4>
            <ul className="space-y-2">
              <li>
                <a href="/guide" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.guide")}
                </a>
              </li>
              <li>
                <span className="text-sm text-slate-500">
                  {t("footer.blog")} <span className="text-xs">{t("footer.blogSoon")}</span>
                </span>
              </li>
              <li>
                <a href="/aide" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.aide")}
                </a>
              </li>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t("footer.legal")}</h4>
            <ul className="space-y-2">
              <li>
                <a href="/mentions-legales" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.mentions")}
                </a>
              </li>
              <li>
                <a href="/cgu" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.cgu")}
                </a>
              </li>
              <li>
                <a href="/cgv" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.cgv")}
                </a>
              </li>
              <li>
                <a href="/confidentialite" className="text-sm text-slate-400 hover:text-white transition-colors">
                  {t("footer.confidentialite")}
                </a>
              </li>
              <li>
                <a
                  href="mailto:contact@operioz.com"
                  className="text-sm text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {t("footer.email")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-slate-500">
            {t("footer.madeIn")}
          </p>
        </div>
      </div>
    </footer>
  );
}
