import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
/*
 * Cette page est rendue par App.tsx HORS du ModernRouterMount → on initialise l'i18n du front neuf ici aussi
 * (sinon `t()` renvoie les clés). Idempotent (l'init est gardé par `i18n.isInitialized`).
 */
import "@/shared/i18n";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, PartyPopper, Rocket, Sparkles, type LucideIcon, Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid, MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart, Users, Wrench } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { Input } from "@/shared/ui/input";
import { trpc } from "@/shared/trpc";
import { useOnboarding } from "../application/use-onboarding";
import { METIERS, recommendedSlugs, metierFinal as computeMetierFinal, buildCompletePayload, toggleSlug, type Step } from "../domain/onboarding";

const ICON_MAP: Record<string, LucideIcon> = { Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid, MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart, Sparkles, Users, Wrench };

const stripePromise = loadStripe(
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? "",
);

const VALID_PLAN_IDS = ["starter", "pro", "enterprise"] as const;
type OnboardingPlanId = typeof VALID_PLAN_IDS[number];

function isValidPlanId(p: string | undefined): p is OnboardingPlanId {
  return VALID_PLAN_IDS.includes(p as OnboardingPlanId);
}

interface PaymentFormProps {
  stripeCustomerId: string;
  plan: OnboardingPlanId;
  onSuccess: () => void;
  t: (key: string) => string;
}

function PaymentForm({ stripeCustomerId, plan, onSuccess, t }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const confirmPM = trpc.billing.confirmPaymentMethod.useMutation();
  const activateSub = trpc.billing.activateOnboardingSubscription.useMutation();
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (result.error) {
        toast.error(result.error.message ?? t("paiementErreurStripe"));
        return;
      }
      const pm = result.setupIntent.payment_method;
      const pmStripeId = pm == null ? null : typeof pm === "string" ? pm : pm.id;
      if (!pmStripeId) {
        toast.error(t("paiementErreurPM"));
        return;
      }
      const confirmed = await confirmPM.mutateAsync({
        stripePaymentMethodId: pmStripeId,
        stripeCustomerId,
        setAsDefault: true,
      });
      await activateSub.mutateAsync({ planId: plan, paymentMethodId: confirmed.paymentMethod.id });
      onSuccess();
    } catch {
      toast.error(t("paiementErreurEnregistrement"));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !stripe || !elements;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" size="lg" disabled={disabled} className="w-full bg-white text-slate-900 hover:bg-blue-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("paiementEnregistrer")}
      </Button>
    </form>
  );
}

interface PaymentStepProps {
  plan: OnboardingPlanId;
  onSuccess: () => void;
  onBack: () => void;
  t: (key: string) => string;
}

function PaymentStep({ plan, onSuccess, onBack, t }: PaymentStepProps) {
  const setupIntentMut = trpc.billing.createSetupIntent.useMutation();
  const [setup, setSetup] = useState<{ clientSecret: string; stripeCustomerId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void setupIntentMut.mutateAsync(undefined).then((data) => {
      if (!cancelled) setSetup({ clientSecret: data.clientSecret, stripeCustomerId: data.stripeCustomerId });
    }).catch(() => {
      if (!cancelled) toast.error(t("paiementErreurInit"));
    });
    return () => { cancelled = true; };
  }, []); /* ponytail: run once on mount */

  const trialEndDate = new Date(Date.now() + 15 * 24 * 3600_000).toLocaleDateString("fr-FR");

  return (
    <motion.section key="step4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
      <p className="text-xs uppercase tracking-widest font-semibold text-blue-300/80">{t("etapePaiement")}</p>
      <h2 className="mt-2 text-2xl sm:text-4xl font-bold">{t("paiementTitre")}</h2>
      <p className="mt-3 text-blue-100/80">{t("paiementDesc", { date: trialEndDate })}</p>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-blue-100/70">
        <Lock className="h-4 w-4 shrink-0 text-blue-300" />
        <span>{t("paiementSecurise")}</span>
      </div>
      <div className="mt-6">
        {!setup ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret: setup.clientSecret, appearance: { theme: "night" } }}>
            <PaymentForm stripeCustomerId={setup.stripeCustomerId} plan={plan} onSuccess={onSuccess} t={t} />
          </Elements>
        )}
      </div>
      <div className="mt-4">
        <Button variant="ghost" className="text-blue-100 hover:text-white" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("retour")}
        </Button>
      </div>
    </motion.section>
  );
}

/*
 * Page `/onboarding` (plein écran post-signup) — migration clean-archi de `pages/Onboarding.tsx`. Markup à
 * l'identique. Catalogues/recommandation/payload en domain (testés) ; navigation via window.location.
 */
export default function OnboardingPage() {
  const { t } = useTranslation("onboarding");
  const { modules, complete, skip } = useOnboarding();
  const [step, setStep] = useState<Step>(1);
  const [metierKey, setMetierKey] = useState<string | null>(null);
  const [metierAutre, setMetierAutre] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  const { plan: planParam } = useSearch({ from: "/onboarding" });
  const hasPlan = isValidPlanId(planParam);
  const planId = hasPlan ? planParam : null;

  useEffect(() => {
    if (!metierKey || modules.length === 0) return;
    setSelectedSlugs(recommendedSlugs(metierKey, modules));
  }, [metierKey, modules]);

  const metierFinal = useMemo(() => computeMetierFinal(metierKey, metierAutre), [metierKey, metierAutre]);

  const finish = () => {
    complete.mutate(buildCompletePayload(metierFinal, selectedSlugs), {
      onSuccess: () => { window.location.href = "/dashboard"; },
      onError: (e) => toast.error(e.message || t("errFinaliser")),
    });
  };
  const doSkip = () => skip.mutate(undefined, { onSuccess: () => { toast.info(t("toastSaute")); window.location.href = "/dashboard"; } });

  const totalSteps = hasPlan ? 5 : 4;
  const stepProgress = (step / totalSteps) * 100;

  const finalStep = hasPlan ? 5 : 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl animate-blob" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl animate-blob animation-delay-4000" />
      </div>

      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
        <motion.div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" initial={{ width: 0 }} animate={{ width: `${stepProgress}%` }} transition={{ duration: 0.4 }} />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10 sm:py-16">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.section key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="text-center">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl mb-6"><Sparkles className="h-10 w-10 text-white" /></div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{t("bienvenueTitre")}</h1>
              <p className="mt-4 text-base sm:text-lg text-blue-100/80 max-w-xl mx-auto">{t("bienvenueDesc")}</p>
              <div className="mt-10 flex flex-col items-center gap-3">
                <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50 shadow-lg px-8" onClick={() => setStep(2)}>{t("commencer")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
                <button type="button" onClick={doSkip} disabled={skip.isPending} className="text-sm transition-opacity text-blue-200 hover:text-white">{t("passerDispo")}</button>
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="step2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
              <p className="text-xs uppercase tracking-widest font-semibold text-blue-300/80">{t("etape2")}</p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold">{t("quelMetier")}</h2>
              <p className="mt-2 text-blue-100/80">{t("metierDesc")}</p>
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {METIERS.map((m) => {
                  const active = metierKey === m.key;
                  return (
                    <button key={m.key} type="button" onClick={() => setMetierKey(m.key)} className={`flex flex-col items-center justify-center gap-2 rounded-xl p-4 border transition-all ${active ? "bg-white text-slate-900 border-white shadow-xl scale-[1.03]" : "bg-white/5 hover:bg-white/10 border-white/10"}`}>
                      <span className="text-3xl">{m.emoji}</span>
                      <span className="text-sm font-medium">{t(m.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
              {metierKey === "autre" && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                  <label className="text-sm font-medium text-blue-100">{t("precisezMetier")}</label>
                  <Input value={metierAutre} onChange={(e) => setMetierAutre(e.target.value)} placeholder={t("precisezPlaceholder")} className="mt-2 bg-white/10 border-white/20 text-white placeholder:text-blue-300/60" />
                </motion.div>
              )}
              <div className="mt-10 flex items-center justify-between gap-3">
                <Button variant="ghost" className="text-blue-100 hover:text-white" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> {t("retour")}</Button>
                <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50" disabled={!metierKey || (metierKey === "autre" && !metierAutre.trim())} onClick={() => setStep(3)}>{t("suivant")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </motion.section>
          )}

          {step === 3 && (
            <motion.section key="step3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
              <p className="text-xs uppercase tracking-widest font-semibold text-blue-300/80">{t("etape3")}</p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-bold">{t("choisirFonctionnalites")}</h2>
              <p className="mt-2 text-blue-100/80">{t("preCochees")}<span className="block text-xs text-blue-300/60 mt-1">{t("modifiableParametres")}</span></p>
              <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2">
                {modules.map((m) => {
                  const Icon = ICON_MAP[m.icon] || LayoutGrid;
                  const isOn = selectedSlugs.has(m.slug);
                  return (
                    <div key={m.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${m.locked ? "bg-white/5 border-white/10 opacity-60" : isOn ? "bg-white text-slate-900 border-white shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10"}`}>
                      <div className={`h-10 w-10 shrink-0 rounded-lg inline-flex items-center justify-center ${isOn && !m.locked ? "bg-blue-100 text-blue-600" : "bg-white/10 text-white"}`}>{m.locked ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isOn && !m.locked ? "text-slate-900" : ""}`}>{m.label}</p>
                        <p className={`text-[11px] truncate ${isOn && !m.locked ? "text-slate-600" : "text-blue-200/70"}`}>{m.locked ? t("disponibleAvecPlan", { plan: m.planMinimum }) : m.description}</p>
                      </div>
                      <Switch checked={isOn} disabled={m.locked} onCheckedChange={(checked) => setSelectedSlugs((prev) => toggleSlug(prev, m.slug, checked))} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-10 flex items-center justify-between gap-3">
                <Button variant="ghost" className="text-blue-100 hover:text-white" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> {t("retour")}</Button>
                <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50" onClick={() => setStep(4)}>{t("suivant")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </motion.section>
          )}

          {step === 4 && hasPlan && planId && (
            <PaymentStep
              key="step4"
              plan={planId}
              onSuccess={() => setStep(5)}
              onBack={() => setStep(3)}
              t={t}
            />
          )}

          {step === finalStep && (
            <motion.section key={`step${finalStep}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="text-center">
              <div aria-hidden className="relative mx-auto mb-6 inline-block">
                <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.8, repeat: 2 }} className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-2xl"><PartyPopper className="h-12 w-12 text-white" /></motion.div>
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold">{t("espacePret")}</h2>
              <p className="mt-4 text-base sm:text-lg text-blue-100/80 max-w-xl mx-auto">{metierFinal ? t("modulesActivesPour", { n: selectedSlugs.size, metier: metierFinal }) : t("modulesActives", { n: selectedSlugs.size })}</p>
              <div className="mt-8 mx-auto max-w-md rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="flex items-center gap-3 justify-center text-blue-100"><Sparkles className="h-5 w-5 text-violet-300" /><p className="text-sm">{t("assistantAide")}</p></div>
              </div>
              <div className="mt-10 flex flex-col items-center gap-3">
                <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50 shadow-xl px-8" onClick={finish} disabled={complete.isPending}>{complete.isPending ? t("finalisation") : (<><Rocket className="h-4 w-4 mr-2" /> {t("decouvrirDashboard")}</>)}</Button>
                <button type="button" onClick={finish} className="text-xs text-blue-200/80 hover:text-white inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />{t("ouAssistantDevis")}</button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
