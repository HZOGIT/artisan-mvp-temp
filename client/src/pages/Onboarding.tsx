import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, Lock, PartyPopper, Rocket, Sparkles, type LucideIcon,
  Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid, MapPin,
  MessageCircle, Package, PenTool, Receipt, ShoppingCart, Users, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const ICON_MAP: Record<string, LucideIcon> = {
  Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid,
  MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart, Sparkles,
  Users, Wrench,
};

const METIERS: { key: string; label: string; emoji: string }[] = [
  { key: "plombier", label: "Plombier", emoji: "🔧" },
  { key: "electricien", label: "Électricien", emoji: "⚡" },
  { key: "chauffagiste", label: "Chauffagiste", emoji: "🔥" },
  { key: "climatiseur", label: "Climatiseur", emoji: "❄️" },
  { key: "jardinier", label: "Jardinier", emoji: "🌿" },
  { key: "cuisiniste", label: "Cuisiniste", emoji: "🍳" },
  { key: "menuisier", label: "Menuisier", emoji: "🪑" },
  { key: "peintre", label: "Peintre", emoji: "🎨" },
  { key: "macon", label: "Maçon", emoji: "🏗️" },
  { key: "terrassier", label: "Terrassier", emoji: "🚜" },
  { key: "domotique", label: "Domotique", emoji: "🔌" },
  { key: "autre", label: "Autre", emoji: "✏️" },
];

const MODULES_PAR_METIER: Record<string, string[]> = {
  plombier: ["devis", "factures", "clients", "interventions", "stocks", "relances"],
  electricien: ["devis", "factures", "clients", "interventions", "signature", "relances"],
  chauffagiste: ["devis", "factures", "clients", "interventions", "contrats", "stocks"],
  climatiseur: ["devis", "factures", "clients", "interventions", "contrats"],
  jardinier: ["devis", "factures", "clients", "interventions", "rdv"],
  cuisiniste: ["devis", "factures", "clients", "commandes", "signature"],
  peintre: ["devis", "factures", "clients", "interventions", "signature"],
  macon: ["devis", "factures", "clients", "interventions", "stocks", "commandes"],
  menuisier: ["devis", "factures", "clients", "stocks", "commandes", "signature"],
  terrassier: ["devis", "factures", "clients", "interventions", "commandes"],
  domotique: ["devis", "factures", "clients", "interventions", "signature", "assistant_ia"],
  autre: ["devis", "factures", "clients", "interventions", "relances"],
};

const SKIP_DELAY_S = 30;
type Step = 1 | 2 | 3 | 4;

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [metierKey, setMetierKey] = useState<string | null>(null);
  const [metierAutre, setMetierAutre] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [skipReady, setSkipReady] = useState(false);

  const { data: modules } = trpc.modules.list.useQuery();
  const utils = trpc.useUtils();

  const completeMutation = trpc.modules.completeOnboarding.useMutation({
    onSuccess: () => {
      utils.modules.list.invalidate();
      utils.modules.getMine.invalidate();
      utils.modules.getOnboardingStatus.invalidate();
    },
  });

  const skipMutation = trpc.modules.skipOnboarding.useMutation({
    onSuccess: () => {
      utils.modules.getMine.invalidate();
      utils.modules.getOnboardingStatus.invalidate();
      toast.info("Onboarding sauté — vous pourrez configurer vos modules à tout moment depuis Paramètres.");
      setLocation("/dashboard");
    },
  });

  useEffect(() => {
    if (step !== 1) return;
    const t = setTimeout(() => setSkipReady(true), SKIP_DELAY_S * 1000);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (!metierKey || !modules) return;
    const recos = MODULES_PAR_METIER[metierKey] || MODULES_PAR_METIER.autre;
    setSelectedSlugs(new Set(recos.filter((slug) => modules.some((m) => m.slug === slug))));
  }, [metierKey, modules]);

  const metierFinal = useMemo(() => {
    if (metierKey === "autre") return metierAutre.trim() || "autre";
    return metierKey || "";
  }, [metierKey, metierAutre]);

  const finish = async () => {
    try {
      await completeMutation.mutateAsync({
        metier: metierFinal || undefined,
        moduleSlugs: Array.from(selectedSlugs),
      });
      setLocation("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Impossible de terminer l'onboarding");
    }
  };

  const stepProgress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl animate-blob" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl animate-blob animation-delay-4000" />
      </div>

      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-400 to-violet-500"
          initial={{ width: 0 }}
          animate={{ width: `${stepProgress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10 sm:py-16">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.section
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl mb-6">
                <Sparkles className="h-10 w-10 text-white" />
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Bienvenue sur Operioz ! 🎉</h1>
              <p className="mt-4 text-base sm:text-lg text-blue-100/80 max-w-xl mx-auto">
                Configurons votre espace en 3 minutes pour qu'il colle pile à votre métier.
              </p>
              <div className="mt-10 flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-blue-50 shadow-lg px-8"
                  onClick={() => setStep(2)}
                >
                  Commencer <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <button
                  type="button"
                  onClick={() => skipMutation.mutate()}
                  disabled={skipMutation.isPending}
                  className={`text-sm transition-opacity ${
                    skipReady ? "text-blue-200 hover:text-white" : "text-blue-300/40"
                  }`}
                >
                  {skipReady ? "Passer et aller au dashboard →" : `Passer disponible dans ${SKIP_DELAY_S}s…`}
                </button>
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-xs uppercase tracking-widest font-semibold text-blue-300/80">Étape 2 sur 4</p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold">Quel est votre métier ?</h2>
              <p className="mt-2 text-blue-100/80">On adapte les modules de Operioz à votre activité.</p>

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {METIERS.map((m) => {
                  const active = metierKey === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMetierKey(m.key)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl p-4 border transition-all ${
                        active
                          ? "bg-white text-slate-900 border-white shadow-xl scale-[1.03]"
                          : "bg-white/5 hover:bg-white/10 border-white/10"
                      }`}
                    >
                      <span className="text-3xl">{m.emoji}</span>
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {metierKey === "autre" && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                  <label className="text-sm font-medium text-blue-100">Précisez votre métier :</label>
                  <Input
                    value={metierAutre}
                    onChange={(e) => setMetierAutre(e.target.value)}
                    placeholder="Ex: Carreleur, Couvreur…"
                    className="mt-2 bg-white/10 border-white/20 text-white placeholder:text-blue-300/60"
                  />
                </motion.div>
              )}

              <div className="mt-10 flex items-center justify-between gap-3">
                <Button variant="ghost" className="text-blue-100 hover:text-white" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                </Button>
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-blue-50"
                  disabled={!metierKey || (metierKey === "autre" && !metierAutre.trim())}
                  onClick={() => setStep(3)}
                >
                  Suivant <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.section>
          )}

          {step === 3 && (
            <motion.section
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-xs uppercase tracking-widest font-semibold text-blue-300/80">Étape 3 sur 4</p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold">Choisissez vos fonctionnalités</h2>
              <p className="mt-2 text-blue-100/80">
                Pré-cochées selon votre métier — ajustez à votre convenance.
                <span className="block text-xs text-blue-300/60 mt-1">
                  Vous pourrez modifier ça à tout moment dans Paramètres → Mes modules.
                </span>
              </p>

              <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2">
                {(modules || []).map((m: any) => {
                  const Icon = ICON_MAP[m.icon] || LayoutGrid;
                  const isOn = selectedSlugs.has(m.slug);
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                        m.locked
                          ? "bg-white/5 border-white/10 opacity-60"
                          : isOn
                          ? "bg-white text-slate-900 border-white shadow-lg"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className={`h-10 w-10 shrink-0 rounded-lg inline-flex items-center justify-center ${
                        isOn && !m.locked ? "bg-blue-100 text-blue-600" : "bg-white/10 text-white"
                      }`}>
                        {m.locked ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isOn && !m.locked ? "text-slate-900" : ""}`}>
                          {m.label}
                        </p>
                        <p className={`text-[11px] truncate ${isOn && !m.locked ? "text-slate-600" : "text-blue-200/70"}`}>
                          {m.locked ? `Disponible avec le plan ${m.planMinimum}` : m.description}
                        </p>
                      </div>
                      <Switch
                        checked={isOn}
                        disabled={m.locked}
                        onCheckedChange={(checked) => {
                          setSelectedSlugs((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(m.slug);
                            else next.delete(m.slug);
                            return next;
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-10 flex items-center justify-between gap-3">
                <Button variant="ghost" className="text-blue-100 hover:text-white" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                </Button>
                <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50" onClick={() => setStep(4)}>
                  Suivant <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.section>
          )}

          {step === 4 && (
            <motion.section
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div aria-hidden className="relative mx-auto mb-6 inline-block">
                <motion.div
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.8, repeat: 2 }}
                  className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-2xl"
                >
                  <PartyPopper className="h-12 w-12 text-white" />
                </motion.div>
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold">Votre espace Operioz est prêt ! 🚀</h2>
              <p className="mt-4 text-base sm:text-lg text-blue-100/80 max-w-xl mx-auto">
                <span className="text-white font-semibold">{selectedSlugs.size}</span> modules activés
                {metierFinal && (
                  <> pour <span className="text-white font-semibold capitalize">{metierFinal}</span></>
                )}.
              </p>

              <div className="mt-8 mx-auto max-w-md rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="flex items-center gap-3 justify-center text-blue-100">
                  <Sparkles className="h-5 w-5 text-violet-300" />
                  <p className="text-sm">
                    <span className="font-semibold text-white">MonAssistant</span> est là pour vous aider —
                    parlez-lui en français, arabe ou turc !
                  </p>
                </div>
              </div>

              <div className="mt-10 flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-blue-50 shadow-xl px-8"
                  onClick={finish}
                  disabled={completeMutation.isPending}
                >
                  {completeMutation.isPending ? "Finalisation…" : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" /> Découvrir mon dashboard
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => finish()}
                  className="text-xs text-blue-200/80 hover:text-white inline-flex items-center gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  Ou demandez à MonAssistant de créer votre premier devis 🎤
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
