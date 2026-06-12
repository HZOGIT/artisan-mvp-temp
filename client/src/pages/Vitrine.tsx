import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  HardHat,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Users as UsersIcon,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ============================================================================
// Couleur de marque par specialite metier
// ============================================================================

type SpecialiteKey = "plomberie" | "electricite" | "chauffage" | "jardinage" | "autre" | "multi-services";

interface SpecTheme {
  hex: string;
  gradient: string;
  light: string;
  label: string;
  icon: LucideIcon;
}

const SPEC_THEME: Record<SpecialiteKey, SpecTheme> = {
  plomberie: { hex: "#2563eb", gradient: "from-blue-600 to-blue-800", light: "bg-blue-50", label: "Plomberie", icon: Wrench },
  electricite: { hex: "#f59e0b", gradient: "from-amber-500 to-orange-600", light: "bg-amber-50", label: "Électricité", icon: Zap },
  chauffage: { hex: "#ef4444", gradient: "from-rose-600 to-red-700", light: "bg-rose-50", label: "Chauffage", icon: Sparkles },
  jardinage: { hex: "#22c55e", gradient: "from-emerald-500 to-green-700", light: "bg-emerald-50", label: "Jardinage", icon: HardHat },
  "multi-services": { hex: "#6366f1", gradient: "from-indigo-600 to-violet-700", light: "bg-indigo-50", label: "Multi-services", icon: HardHat },
  autre: { hex: "#6366f1", gradient: "from-indigo-600 to-violet-700", light: "bg-indigo-50", label: "Artisan", icon: HardHat },
};

function getTheme(specialite: string | null | undefined): SpecTheme {
  const key = (specialite || "autre") as SpecialiteKey;
  return SPEC_THEME[key] || SPEC_THEME.autre;
}

// ============================================================================
// Helpers
// ============================================================================

function relativeDate(date: string | Date): string {
  const d = new Date(date);
  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (months < 1) {
    const days = Math.floor(months * 30);
    if (days < 1) return "Aujourd'hui";
    if (days < 7) return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
    const weeks = Math.floor(days / 7);
    return `Il y a ${weeks} semaine${weeks > 1 ? "s" : ""}`;
  }
  if (months < 12) {
    const m = Math.floor(months);
    return `Il y a ${m} mois`;
  }
  const years = Math.floor(months / 12);
  return `Il y a ${years} an${years > 1 ? "s" : ""}`;
}

function clientNameShort(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || "Client";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function StarRating({ note, size = "md", color = "#f59e0b" }: { note: number; size?: "sm" | "md" | "lg"; color?: string }) {
  const px = size === "lg" ? 24 : size === "sm" ? 14 : 18;
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={px}
          height={px}
          fill={i <= Math.round(note) ? color : "transparent"}
          stroke={color}
          strokeWidth={2}
        />
      ))}
    </div>
  );
}

/** Maj du title pour les liens partages (sans react-helmet). */
function DocTitle({ title }: { title: string }) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);
  return null;
}

// ============================================================================
// Component
// ============================================================================

export default function Vitrine() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = trpc.vitrine.getBySlug.useQuery(
    { slug: slug || "" },
    { enabled: !!slug, retry: false }
  );

  const [contactForm, setContactForm] = useState({ nom: "", email: "", telephone: "", message: "", type: "" });
  const [contactSent, setContactSent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const contactMutation = trpc.vitrine.submitContact.useMutation({
    onSuccess: () => {
      setContactSent(true);
      setContactForm({ nom: "", email: "", telephone: "", message: "", type: "" });
    },
    onError: (err) => toast.error(err.message || "Impossible d'envoyer le message"),
  });

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    contactMutation.mutate({
      slug,
      nom: contactForm.nom,
      email: contactForm.email,
      telephone: contactForm.telephone || undefined,
      message: `${contactForm.type ? `[${contactForm.type}] ` : ""}${contactForm.message}`,
    });
  };

  // Photos de realisations : non encore stockees, placeholder vide.
  const photos: string[] = [];

  const theme = useMemo(() => getTheme(data?.artisan.specialite), [data]);
  const initials = useMemo(() => {
    const name = data?.artisan.nomEntreprise || "Artisan";
    return name.split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();
  }, [data]);

  // Annee de creation = (annee actuelle) - experience si dispo.
  const anneeCreation = useMemo(() => {
    const exp = data?.vitrine.experience;
    if (typeof exp !== "number" || exp < 1) return null;
    return new Date().getFullYear() - exp;
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="mt-4 text-sm text-muted-foreground">Chargement de la vitrine…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Vitrine introuvable</h1>
          <p className="text-sm text-muted-foreground">
            Cette page n'existe pas ou n'est plus active.
          </p>
        </div>
      </div>
    );
  }

  const { artisan, vitrine, avis, avisStats, publicStats } = data;
  const ThemeIcon = theme.icon;
  const hasRating = avisStats.total > 0;

  // OPE-113 — données structurées schema.org (rich snippet « étoiles » Google) à partir
  // des stats d'avis DÉJÀ calculées. `aggregateRating` uniquement s'il existe au moins
  // 1 avis publié (règle Google : pas de faux agrégat). Adresse au niveau localité
  // (ville/CP, pas la rue) pour limiter l'exposition. Aucune nouvelle donnée ni backend.
  const a: any = artisan;
  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: a.nomEntreprise || "Artisan",
    ...(a.telephone ? { telephone: a.telephone } : {}),
    ...(a.logo ? { image: a.logo } : {}),
    ...((a.ville || a.codePostal)
      ? {
          address: {
            "@type": "PostalAddress",
            ...(a.codePostal ? { postalCode: a.codePostal } : {}),
            ...(a.ville ? { addressLocality: a.ville } : {}),
            addressCountry: "FR",
          },
        }
      : {}),
    ...(typeof window !== "undefined" ? { url: window.location.href } : {}),
    ...(hasRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avisStats.moyenne,
            reviewCount: avisStats.total,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DocTitle title={`${artisan.nomEntreprise} — ${theme.label} | Operioz`} />
      {/* OPE-113 — JSON-LD AggregateRating (étoiles Google) injecté depuis avisStats. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ─────────── NAV FIXE ─────────── */}
      <nav className="fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="#hero" className="flex items-center gap-2 min-w-0">
            {artisan.logo ? (
              <img src={artisan.logo} alt="" className="h-8 w-8 rounded object-contain shrink-0" />
            ) : (
              <span
                className="h-8 w-8 rounded inline-flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: theme.hex }}
              >
                {initials}
              </span>
            )}
            <span className="font-semibold text-sm truncate">{artisan.nomEntreprise}</span>
          </a>
          <div className="hidden md:flex items-center gap-1">
            <a href="#about" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">À propos</a>
            <a href="#services" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">Services</a>
            <a href="#avis" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">Avis</a>
            <a href="#contact" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">Contact</a>
            <a
              href="#contact"
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-semibold px-3.5 py-1.5 transition-all shadow-sm hover:shadow-md"
              style={{ backgroundColor: theme.hex }}
            >
              Demander un devis →
            </a>
          </div>
          <button
            type="button"
            className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded hover:bg-slate-100"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
              <a onClick={() => setMobileMenuOpen(false)} href="#about" className="py-2 text-sm text-slate-700">À propos</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#services" className="py-2 text-sm text-slate-700">Services</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#avis" className="py-2 text-sm text-slate-700">Avis</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#contact" className="py-2 text-sm text-slate-700">Contact</a>
            </div>
          </div>
        )}
      </nav>

      {/* ─────────── SECTION 1 — HERO ─────────── */}
      <header id="hero" className={`pt-14 bg-gradient-to-br ${theme.gradient} text-white relative overflow-hidden`}>
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 pt-12 pb-16 md:pt-20 md:pb-24 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-6"
          >
            {artisan.logo ? (
              <img
                src={artisan.logo}
                alt={artisan.nomEntreprise || ""}
                className="h-28 w-28 rounded-full object-contain bg-white border-4 border-white/30 shadow-xl mx-auto"
              />
            ) : (
              <div className="h-28 w-28 rounded-full bg-white/15 backdrop-blur-sm border-4 border-white/30 flex items-center justify-center mx-auto shadow-xl">
                <span className="text-4xl font-bold">{initials}</span>
              </div>
            )}
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{artisan.nomEntreprise}</h1>
          <p className="mt-2 text-white/90 inline-flex items-center gap-2">
            <ThemeIcon className="h-4 w-4" />
            {theme.label}
          </p>

          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-1 text-xs font-medium">
              <BadgeCheck className="h-4 w-4 text-cyan-200" />
              Artisan vérifié Operioz
            </span>
            {hasRating && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-1 text-xs font-medium">
                <StarRating note={avisStats.moyenne} size="sm" color="#fde68a" />
                <span className="ml-1 font-bold">{avisStats.moyenne}/5</span>
                <span className="text-white/80">({avisStats.total})</span>
              </span>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {artisan.telephone && (
              <a
                href={`tel:${artisan.telephone}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-slate-900 px-4 py-2.5 text-sm font-semibold shadow-md hover:shadow-lg transition-shadow"
              >
                <Phone className="h-4 w-4" /> Appeler
              </a>
            )}
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm border border-white/25 text-white px-4 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"
            >
              <MessageSquare className="h-4 w-4" /> Envoyer un message
            </a>
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 text-amber-950 px-4 py-2.5 text-sm font-semibold shadow-md hover:bg-amber-300 transition-colors"
            >
              <Send className="h-4 w-4" /> Demander un devis
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/85">
            {artisan.ville && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {artisan.ville}</span>
            )}
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Répond en moins de 24h</span>
            {vitrine.experience && (
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {vitrine.experience} ans d'expérience</span>
            )}
          </div>
        </div>
      </header>

      {/* ─────────── SECTION 2 — STATS ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: UsersIcon, value: publicStats.totalClients, label: "clients satisfaits" },
            { icon: Star, value: hasRating ? `${avisStats.moyenne}/5` : "—", label: "note moyenne" },
            { icon: CheckCircle2, value: publicStats.totalInterventions, label: "interventions réalisées" },
            { icon: TrendingUp, value: anneeCreation ? `Depuis ${anneeCreation}` : "Pro local", label: "expérience" },
          ].map(({ icon: Icon, value, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="text-center"
            >
              <Icon className="h-5 w-5 mx-auto mb-1" style={{ color: theme.hex }} />
              <p className="text-xl md:text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─────────── SECTION 3 — A PROPOS ─────────── */}
      <section id="about" className="bg-slate-50 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
            À propos de {artisan.nomEntreprise}
          </h2>
          <div className="prose prose-slate max-w-none">
            {vitrine.description ? (
              <p className="text-slate-700 leading-relaxed whitespace-pre-line">{vitrine.description}</p>
            ) : (
              <p className="text-slate-500 italic">
                {artisan.nomEntreprise} est un professionnel local à votre service.
              </p>
            )}
          </div>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            {vitrine.zone && (
              <div className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4">
                <MapPin className="h-5 w-5 mt-0.5 shrink-0" style={{ color: theme.hex }} />
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Zone d'intervention</p>
                  <p className="text-sm font-medium text-slate-900 mt-1">{vitrine.zone}</p>
                </div>
              </div>
            )}
            {artisan.siret && (
              <div className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4">
                <Building className="h-5 w-5 mt-0.5 shrink-0" style={{ color: theme.hex }} />
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SIRET</p>
                  <p className="text-sm font-mono font-medium text-slate-900 mt-1">{artisan.siret}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─────────── SECTION 4 — SERVICES ─────────── */}
      {vitrine.services.length > 0 && (
        <section id="services" className="bg-white py-12 md:py-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Nos services</h2>
            <p className="text-slate-500 text-sm mb-8">
              Découvrez les prestations proposées par {artisan.nomEntreprise}.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vitrine.services.map((service: string, i: number) => (
                <motion.div
                  key={`${service}-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -3 }}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all"
                >
                  <div className={`h-11 w-11 rounded-xl text-white inline-flex items-center justify-center shadow-md bg-gradient-to-br ${theme.gradient} mb-3`}>
                    <ThemeIcon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-slate-900">{service}</p>
                  <p className="text-xs text-slate-500 mt-1">Sur devis — réponse sous 24h.</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─────────── SECTION 5 — GALERIE (si dispo) ─────────── */}
      {photos.length > 0 && (
        <section className="bg-slate-50 py-12">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">Nos réalisations</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIdx(i)}
                  className="aspect-square rounded-xl overflow-hidden bg-slate-200 hover:opacity-90 transition-opacity"
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <AnimatePresence>
              {lightboxIdx !== null && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                  onClick={() => setLightboxIdx(null)}
                >
                  <img src={photos[lightboxIdx]} alt="" className="max-w-full max-h-full object-contain" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* ─────────── SECTION 6 — AVIS CLIENTS ─────────── */}
      <section id="avis" className="bg-slate-50 py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">Avis clients</h2>
          {hasRating ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-6">
                <div className="grid md:grid-cols-3 gap-6 items-center">
                  <div className="text-center md:text-left">
                    <div className="text-5xl font-bold tabular-nums" style={{ color: theme.hex }}>
                      {avisStats.moyenne.toFixed(1)}
                    </div>
                    <StarRating note={avisStats.moyenne} size="lg" color={theme.hex} />
                    <p className="text-sm text-slate-500 mt-1">Basé sur {avisStats.total} avis</p>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((n) => {
                      const count = avisStats.distribution[n] || 0;
                      const pct = avisStats.total > 0 ? (count / avisStats.total) * 100 : 0;
                      return (
                        <div key={n} className="flex items-center gap-2 text-xs">
                          <span className="w-6 text-right text-slate-600">{n}★</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: theme.hex }}
                            />
                          </div>
                          <span className="w-8 text-right text-slate-500 tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {avis.slice(0, 8).map((a: any, i: number) => (
                  <motion.article
                    key={a.id}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{clientNameShort(a.clientNom)}</p>
                        <p className="text-[11px] text-slate-500">{relativeDate(a.createdAt)}</p>
                      </div>
                      <StarRating note={a.note} size="sm" color={theme.hex} />
                    </div>
                    {a.commentaire && (
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {a.commentaire}
                      </p>
                    )}
                    {a.reponseArtisan && (
                      <div className="mt-3 pl-3 border-l-2" style={{ borderColor: theme.hex }}>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Réponse de {artisan.nomEntreprise}
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{a.reponseArtisan}</p>
                      </div>
                    )}
                  </motion.article>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              <Star className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm">{artisan.nomEntreprise} n'a pas encore reçu d'avis client.</p>
              <p className="text-xs mt-1">Soyez le premier à témoigner après votre prestation.</p>
            </div>
          )}
        </div>
      </section>

      {/* ─────────── SECTION 7 — CONTACT ─────────── */}
      <section
        id="contact"
        className="py-12 md:py-16 text-white"
        style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}
      >
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Demander un devis gratuit</h2>
          <p className="text-white/90 text-sm mb-6">
            Décrivez votre projet, {artisan.nomEntreprise} vous répondra dans les 24h.
          </p>

          {contactSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-white text-slate-900 p-8 text-center shadow-xl"
            >
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-xl font-bold mb-2">Votre demande a été envoyée !</h3>
              <p className="text-sm text-slate-600">
                {artisan.nomEntreprise} vous répondra dans les 24h à l'adresse que vous avez indiquée.
              </p>
            </motion.div>
          ) : (
            <form
              onSubmit={handleSubmitContact}
              className="rounded-2xl bg-white text-slate-900 p-5 md:p-6 shadow-xl space-y-4"
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="v-nom">Nom *</Label>
                  <Input id="v-nom" required value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="v-email">Email *</Label>
                  <Input id="v-email" type="email" required value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="v-tel">Téléphone</Label>
                  <Input id="v-tel" type="tel" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="v-type">Type de prestation</Label>
                  <Select value={contactForm.type} onValueChange={(v) => setContactForm({ ...contactForm, type: v })}>
                    <SelectTrigger id="v-type">
                      <SelectValue placeholder="Sélectionner…" />
                    </SelectTrigger>
                    <SelectContent>
                      {vitrine.services.slice(0, 10).map((s: string, i: number) => (
                        <SelectItem key={i} value={s}>{s}</SelectItem>
                      ))}
                      <SelectItem value="Autre">Autre / Devis personnalisé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="v-msg">Votre message *</Label>
                <Textarea
                  id="v-msg"
                  rows={5}
                  required
                  minLength={10}
                  placeholder="Décrivez votre besoin en quelques mots…"
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                />
              </div>
              <Button
                type="submit"
                className="w-full text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-shadow"
                style={{ backgroundColor: theme.hex }}
                disabled={contactMutation.isPending}
              >
                {contactMutation.isPending ? "Envoi en cours…" : (
                  <><Send className="h-4 w-4 mr-2" /> Envoyer ma demande</>
                )}
              </Button>
            </form>
          )}
        </div>
      </section>

      {/* ─────────── FOOTER ─────────── */}
      <footer className="bg-slate-900 text-slate-300 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span>Propulsé par <span className="font-semibold text-white">Operioz</span></span>
          </div>
          <a
            href="https://www.operioz.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            Créer votre vitrine gratuitement <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="max-w-5xl mx-auto px-4 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} {artisan.nomEntreprise}</span>
          <span>Mentions légales · CGV · Politique de confidentialité</span>
        </div>
      </footer>

      {/* ─────────── BARRE MOBILE STICKY ─────────── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="grid grid-cols-2 gap-2 p-2">
          {artisan.telephone ? (
            <a
              href={`tel:${artisan.telephone}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-slate-900 py-3 text-sm font-semibold"
            >
              <Phone className="h-4 w-4" /> Appeler
            </a>
          ) : (
            <a
              href="#contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-slate-900 py-3 text-sm font-semibold"
            >
              <MessageSquare className="h-4 w-4" /> Message
            </a>
          )}
          <a
            href="#contact"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg text-white py-3 text-sm font-semibold shadow-md"
            style={{ backgroundColor: theme.hex }}
          >
            <Send className="h-4 w-4" /> Devis
          </a>
        </div>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </div>
      <div className="md:hidden h-20" />
    </div>
  );
}
