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
  Droplets,
  Zap,
  Flame,
  Snowflake,
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
  BookOpen,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* NAVBAR */}
      <Navbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      {/* HERO */}
      <HeroSection />

      {/* FONCTIONNALITÉS */}
      <FeaturesSection />

      {/* ADAPTÉ À VOTRE MÉTIER */}
      <TradesSection />

      {/* COMMENT ÇA MARCHE */}
      <HowItWorksSection />

      {/* TARIFS */}
      <PricingSection />

      {/* TÉMOIGNAGES */}
      <TestimonialsSection />

      {/* FAQ */}
      <FAQSection />

      {/* CTA FINAL */}
      <FinalCTASection />

      {/* FOOTER */}
      <Footer />
    </div>
  );
}

/* ─────────────── SCROLL ANIMATION HOOK ─────────────── */

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

/* ─────────────── 1. NAVBAR ─────────────── */

function Navbar({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}) {
  const scrollTo = useCallback((id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [setMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <Wrench className="h-7 w-7 text-[#2563EB]" />
            <span className="text-xl font-bold text-[#1F2937]">MonArtisan Pro</span>
          </a>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo("fonctionnalites")} className="text-sm font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors">
              Fonctionnalités
            </button>
            <button onClick={() => scrollTo("tarifs")} className="text-sm font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors">
              Tarifs
            </button>
            <button onClick={() => scrollTo("temoignages")} className="text-sm font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors">
              Témoignages
            </button>
            <button onClick={() => scrollTo("faq")} className="text-sm font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors">
              FAQ
            </button>
          </nav>

          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="outline" asChild>
              <a href="/sign-in">Se connecter</a>
            </Button>
            <Button asChild className="bg-[#2563EB] hover:bg-[#1D4ED8]">
              <a href="/signup">Essai gratuit</a>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 space-y-3">
          <button onClick={() => scrollTo("fonctionnalites")} className="block w-full text-left py-2 text-sm font-medium text-[#6B7280] hover:text-[#1F2937]">
            Fonctionnalités
          </button>
          <button onClick={() => scrollTo("tarifs")} className="block w-full text-left py-2 text-sm font-medium text-[#6B7280] hover:text-[#1F2937]">
            Tarifs
          </button>
          <button onClick={() => scrollTo("temoignages")} className="block w-full text-left py-2 text-sm font-medium text-[#6B7280] hover:text-[#1F2937]">
            Témoignages
          </button>
          <button onClick={() => scrollTo("faq")} className="block w-full text-left py-2 text-sm font-medium text-[#6B7280] hover:text-[#1F2937]">
            FAQ
          </button>
          <div className="pt-3 border-t border-gray-200 flex flex-col gap-2">
            <Button variant="outline" asChild className="w-full">
              <a href="/sign-in">Se connecter</a>
            </Button>
            <Button asChild className="w-full bg-[#2563EB] hover:bg-[#1D4ED8]">
              <a href="/signup">Essai gratuit</a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ─────────────── 2. HERO SECTION ─────────────── */

function HeroSection() {
  const scrollToFeatures = () => {
    const el = document.getElementById("fonctionnalites");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-white to-[#EFF6FF]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231E40AF' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-32">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1F2937]">
            Gérez votre activité d'artisan{" "}
            <span className="text-[#2563EB]">avec intelligence</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[#6B7280] max-w-3xl mx-auto">
            Devis, factures, clients, planification, comptabilité, assistant IA — tout en un seul outil conçu pour les artisans du bâtiment
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="bg-[#2563EB] hover:bg-[#1D4ED8] text-base px-8 py-6 w-full sm:w-auto">
              <a href="/signup">
                Commencer gratuitement — 14 jours offerts
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToFeatures} className="text-base px-8 py-6 w-full sm:w-auto">
              Découvrir les fonctionnalités
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {[
            { label: "500+ articles métier", icon: BookOpen },
            { label: "Conforme 2026", icon: ShieldCheck },
            { label: "100% mobile", icon: Smartphone },
            { label: "IA intégrée", icon: Sparkles },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-2 text-center">
              <div className="h-10 w-10 rounded-full bg-[#2563EB]/10 flex items-center justify-center">
                <stat.icon className="h-5 w-5 text-[#2563EB]" />
              </div>
              <span className="text-sm font-semibold text-[#1F2937]">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 3. FONCTIONNALITÉS ─────────────── */

const features = [
  {
    icon: FileText,
    title: "Devis professionnels",
    description: "Créez des devis en 2 minutes avec votre bibliothèque d'articles. Transformez-les en factures en 1 clic.",
  },
  {
    icon: Receipt,
    title: "Facturation conforme",
    description: "Factures aux normes 2026, numérotation automatique, export FEC pour votre comptable.",
  },
  {
    icon: Users,
    title: "Gestion clients",
    description: "Fichier client complet avec historique, documents, et portail client dédié.",
  },
  {
    icon: Globe,
    title: "Portail client",
    description: "Vos clients consultent leurs devis, factures et suivent leurs projets en temps réel.",
  },
  {
    icon: Calendar,
    title: "Planification & Calendrier",
    description: "Calendrier interactif, planification des interventions, vue jour/semaine/mois.",
  },
  {
    icon: Sparkles,
    title: "Assistant IA",
    description: "Un assistant intelligent qui analyse votre activité, génère des devis et prédit votre trésorerie.",
  },
  {
    icon: CreditCard,
    title: "Paiement en ligne",
    description: "Vos clients paient directement par carte bancaire via Stripe depuis leur portail.",
  },
  {
    icon: MessageCircle,
    title: "Chat client",
    description: "Messagerie intégrée pour échanger avec vos clients sans quitter l'application.",
  },
  {
    icon: MapPin,
    title: "Géolocalisation",
    description: "Visualisez vos techniciens sur une carte et optimisez les affectations par proximité.",
  },
  {
    icon: ClipboardList,
    title: "Contrats maintenance",
    description: "Gérez vos contrats récurrents, planifiez les interventions et facturez automatiquement.",
  },
];

function FeaturesSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="fonctionnalites" className="py-20 sm:py-24 bg-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Tous les outils pour piloter votre activité
          </h2>
          <p className="mt-4 text-lg text-[#6B7280]">
            Plus de 40 fonctionnalités pensées pour le quotidien des artisans
          </p>
        </div>
        <div
          className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="h-12 w-12 rounded-lg bg-[#EFF6FF] flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-[#2563EB]" />
              </div>
              <h3 className="text-base font-semibold text-[#1F2937] mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 4. MÉTIERS ─────────────── */

const trades = [
  {
    icon: Droplets,
    title: "Plomberie",
    description: "500+ articles : robinetterie, tuyauterie, sanitaire, chauffe-eau...",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: Zap,
    title: "Électricité",
    description: "450+ articles : tableaux électriques, câblage, domotique...",
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    icon: Flame,
    title: "Chauffage",
    description: "400+ articles : chaudières, radiateurs, pompes à chaleur...",
    color: "bg-orange-100 text-orange-600",
  },
  {
    icon: Snowflake,
    title: "Climatisation",
    description: "300+ articles : climatiseurs, VMC, traitement d'air...",
    color: "bg-cyan-100 text-cyan-600",
  },
  {
    icon: Wrench,
    title: "Multi-métiers",
    description: "Combinez les bibliothèques selon vos spécialités",
    color: "bg-purple-100 text-purple-600",
  },
];

function TradesSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section className="py-20 sm:py-24 bg-[#F9FAFB]">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Adapté à votre corps de métier
          </h2>
          <p className="mt-4 text-lg text-[#6B7280]">
            Une bibliothèque d'articles spécialisée pour chaque corps de métier
          </p>
        </div>
        <div
          className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-5 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {trades.map((trade) => (
            <div
              key={trade.title}
              className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow"
            >
              <div className={`h-14 w-14 rounded-full ${trade.color} flex items-center justify-center mx-auto mb-4`}>
                <trade.icon className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold text-[#1F2937] mb-2">{trade.title}</h3>
              <p className="text-sm text-[#6B7280]">{trade.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 5. COMMENT ÇA MARCHE ─────────────── */

function HowItWorksSection() {
  const { ref, isVisible } = useScrollReveal();

  const steps = [
    {
      num: "1",
      icon: UserPlus,
      title: "Créez votre compte",
      description: "Inscription gratuite en 2 minutes. Aucune carte bancaire requise.",
    },
    {
      num: "2",
      icon: Settings,
      title: "Configurez votre activité",
      description: "Importez vos clients, choisissez vos articles métier, personnalisez vos documents.",
    },
    {
      num: "3",
      icon: TrendingUp,
      title: "Développez votre business",
      description: "Créez vos devis, facturez, encaissez et suivez votre chiffre d'affaires.",
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Opérationnel en 3 étapes
          </h2>
        </div>
        <div
          className={`grid gap-8 md:grid-cols-3 max-w-4xl mx-auto transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                  <step.icon className="h-7 w-7 text-[#2563EB]" />
                </div>
                <span className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-[#2563EB] text-white text-sm font-bold flex items-center justify-center">
                  {step.num}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[#1F2937] mb-2">{step.title}</h3>
              <p className="text-sm text-[#6B7280]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 6. TARIFS ─────────────── */

const plans = [
  {
    name: "Essentiel",
    price: "29",
    popular: false,
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
    price: "49",
    popular: true,
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
    price: "79",
    popular: false,
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
];

function PricingSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="tarifs" className="py-20 sm:py-24 bg-[#F9FAFB]">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Des tarifs simples et transparents
          </h2>
          <p className="mt-4 text-lg text-[#6B7280]">
            14 jours d'essai gratuit sur toutes les offres — Sans engagement
          </p>
        </div>
        <div
          className={`grid gap-8 md:grid-cols-3 max-w-5xl mx-auto transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl border-2 p-8 flex flex-col ${
                plan.popular
                  ? "border-[#2563EB] shadow-xl md:-translate-y-2"
                  : "border-gray-200"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#2563EB] text-white text-xs font-semibold px-4 py-1 rounded-full">
                  Plus populaire
                </span>
              )}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#1F2937]">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#1F2937]">{plan.price}€</span>
                  <span className="text-[#6B7280]">/mois</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-[#1F2937]">
                    <Check className="h-4 w-4 text-[#2563EB] mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={`w-full py-6 ${
                  plan.popular
                    ? "bg-[#2563EB] hover:bg-[#1D4ED8]"
                    : "bg-[#1F2937] hover:bg-[#111827]"
                }`}
              >
                <a href="/signup">Commencer l'essai gratuit</a>
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[#6B7280]">
          Tous les prix sont HT. Facturation mensuelle ou annuelle (-20%).
        </p>
      </div>
    </section>
  );
}

/* ─────────────── 7. TÉMOIGNAGES ─────────────── */

const testimonials = [
  {
    name: "Marc Dubois",
    role: "Plombier à Lyon",
    rating: 5,
    text: "Depuis que j'utilise MonArtisan Pro, je gagne 2 heures par jour sur ma gestion. Les devis partent en 5 minutes et mes clients peuvent payer en ligne. Un vrai game-changer.",
  },
  {
    name: "Sophie Martin",
    role: "Électricienne à Marseille",
    rating: 5,
    text: "L'assistant IA m'aide à anticiper ma trésorerie et le portail client a professionnalisé mon image. Mes clients adorent pouvoir suivre leurs projets en ligne.",
  },
  {
    name: "Karim Benali",
    role: "Chauffagiste à Paris",
    rating: 4.5,
    text: "La gestion des contrats de maintenance et la géolocalisation de mes 3 techniciens me font gagner un temps fou. L'application est intuitive, même sur téléphone.",
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= Math.floor(rating)
              ? "fill-yellow-400 text-yellow-400"
              : i - 0.5 <= rating
              ? "fill-yellow-400/50 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

function TestimonialsSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="temoignages" className="py-20 sm:py-24 bg-white">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Ils nous font confiance
          </h2>
        </div>
        <div
          className={`grid gap-8 md:grid-cols-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <StarRating rating={t.rating} />
              <p className="mt-4 text-sm text-[#1F2937] leading-relaxed italic">
                "{t.text}"
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#2563EB]/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-[#2563EB]">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">{t.name}</p>
                  <p className="text-xs text-[#6B7280]">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 8. FAQ ─────────────── */

const faqItems = [
  {
    question: "Est-ce adapté à mon métier ?",
    answer:
      "MonArtisan Pro est conçu pour les plombiers, électriciens, chauffagistes, climaticiens et artisans multi-métiers. Chaque métier dispose de sa propre bibliothèque d'articles avec plus de 300 références prêtes à l'emploi.",
  },
  {
    question: "Puis-je importer mes clients existants ?",
    answer:
      "Oui, vous pouvez importer votre fichier clients au format CSV en quelques clics. Toutes les données sont conservées : coordonnées, historique, notes.",
  },
  {
    question: "Comment fonctionne l'essai gratuit ?",
    answer:
      "L'essai gratuit dure 14 jours avec accès complet à l'offre Pro. Aucune carte bancaire n'est requise. À la fin de l'essai, vous choisissez l'offre qui vous convient.",
  },
  {
    question: "Mes données sont-elles sécurisées ?",
    answer:
      "Vos données sont hébergées sur des serveurs sécurisés avec chiffrement SSL, sauvegardes quotidiennes et conformité RGPD. Vous restez propriétaire de vos données.",
  },
  {
    question: "Puis-je annuler à tout moment ?",
    answer:
      "Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis votre espace. Vos données restent accessibles pendant 30 jours après résiliation.",
  },
  {
    question: "La facturation électronique 2026, c'est quoi ?",
    answer:
      "À partir de 2026, toutes les entreprises françaises devront émettre et recevoir des factures au format électronique. MonArtisan Pro est déjà conforme avec la génération de factures aux normes et l'export FEC.",
  },
  {
    question: "Puis-je utiliser l'application sur mon téléphone ?",
    answer:
      "Oui, MonArtisan Pro est une application responsive qui fonctionne parfaitement sur smartphone et tablette. Vous pouvez même l'installer comme une app depuis votre navigateur (PWA).",
  },
];

function FAQSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="faq" className="py-20 sm:py-24 bg-[#F9FAFB]">
      <div ref={ref} className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1F2937]">
            Questions fréquentes
          </h2>
        </div>
        <div
          className={`transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <Accordion type="single" collapsible className="bg-white rounded-xl border border-gray-200 px-6">
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-[#1F2937] font-medium hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-[#6B7280] leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 9. CTA FINAL ─────────────── */

function FinalCTASection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E40AF] to-[#2563EB] px-8 py-16 sm:px-16 sm:py-20 text-center">
          {/* Subtle pattern */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Prêt à simplifier votre gestion ?
            </h2>
            <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
              Rejoignez les artisans qui ont choisi MonArtisan Pro pour développer leur activité.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild className="bg-white text-[#1E40AF] hover:bg-blue-50 text-base px-8 py-6">
                <a href="/signup">
                  Créer mon compte gratuitement
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── 10. FOOTER ─────────────── */

function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="bg-[#1F2937] text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Col 1 - Logo */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="h-6 w-6 text-[#2563EB]" />
              <span className="text-lg font-bold text-white">MonArtisan Pro</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              La solution tout-en-un pour les artisans du bâtiment
            </p>
          </div>

          {/* Col 2 - Produit */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Produit</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => scrollTo("fonctionnalites")} className="text-sm text-gray-400 hover:text-white transition-colors">
                  Fonctionnalités
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("tarifs")} className="text-sm text-gray-400 hover:text-white transition-colors">
                  Tarifs
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("temoignages")} className="text-sm text-gray-400 hover:text-white transition-colors">
                  Témoignages
                </button>
              </li>
              <li>
                <button onClick={() => scrollTo("faq")} className="text-sm text-gray-400 hover:text-white transition-colors">
                  FAQ
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3 - Ressources */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Ressources</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-gray-400">Guide d'utilisation</span>
              </li>
              <li>
                <span className="text-sm text-gray-400">Blog <span className="text-xs">(bientôt)</span></span>
              </li>
              <li>
                <span className="text-sm text-gray-400">Centre d'aide</span>
              </li>
            </ul>
          </div>

          {/* Col 4 - Légal */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Légal</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-gray-400">Mentions légales</span>
              </li>
              <li>
                <span className="text-sm text-gray-400">CGV</span>
              </li>
              <li>
                <span className="text-sm text-gray-400">Politique de confidentialité</span>
              </li>
              <li>
                <span className="text-sm text-gray-400">Contact</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} MonArtisan Pro. Tous droits réservés.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="LinkedIn">
              <Linkedin className="h-5 w-5" />
            </a>
            <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="Facebook">
              <Facebook className="h-5 w-5" />
            </a>
            <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="Instagram">
              <Instagram className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
