import { useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, Building, Calendar, CheckCircle2, Clock, ExternalLink, HardHat, MapPin, Menu, MessageSquare, Phone, Send, Sparkles, Star, TrendingUp, Users as UsersIcon, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useVitrine } from "../application/use-vitrine";
import { getTheme, computeInitials, clientNameShort, anneeCreation, buildJsonLd, buildContactMessage, type SpecialiteKey } from "../domain/vitrine";

// Page `/vitrine/:slug` — migration clean-archi de `pages/Vitrine.tsx` (publique). Markup à l'identique.
// Thème/helpers/JSON-LD en domain (pur, testé) ; le payload `getBySlug` (unknown backend) est casté en application.

const SPEC_ICON: Record<SpecialiteKey, LucideIcon> = { plomberie: Wrench, electricite: Zap, chauffage: Sparkles, jardinage: HardHat, "multi-services": HardHat, autre: HardHat };

function StarRating({ note, size = "md", color = "#f59e0b" }: { note: number; size?: "sm" | "md" | "lg"; color?: string }) {
  const px = size === "lg" ? 24 : size === "sm" ? 14 : 18;
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (<Star key={i} width={px} height={px} fill={i <= Math.round(note) ? color : "transparent"} stroke={color} strokeWidth={2} />))}
    </div>
  );
}

function DocTitle({ title }: { title: string }) {
  useEffect(() => { const prev = document.title; document.title = title; return () => { document.title = prev; }; }, [title]);
  return null;
}

export default function VitrinePage() {
  const { t } = useTranslation("vitrinePublic");
  const { slug: slugParam } = useParams({ strict: false }) as { slug?: string };
  const slug = slugParam || "";
  const { data, isLoading, error, submitContact } = useVitrine(slug);

  const [contactForm, setContactForm] = useState({ nom: "", email: "", telephone: "", message: "", type: "" });
  const [contactSent, setContactSent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const photos: string[] = []; // non encore stockées

  const theme = useMemo(() => getTheme(data?.artisan.specialite), [data]);
  const initials = useMemo(() => computeInitials(data?.artisan.nomEntreprise), [data]);
  const annee = useMemo(() => anneeCreation(data?.vitrine.experience), [data]);

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    submitContact.mutate(
      { slug, nom: contactForm.nom, email: contactForm.email, telephone: contactForm.telephone || undefined, message: buildContactMessage(contactForm.type, contactForm.message) },
      { onSuccess: () => { setContactSent(true); setContactForm({ nom: "", email: "", telephone: "", message: "", type: "" }); }, onError: (err) => toast.error(err.message || t("errContact")) },
    );
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="inline-block h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" /><p className="mt-4 text-sm text-muted-foreground">{t("chargement")}</p></div></div>;
  }
  if (error || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><div className="max-w-md text-center"><AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" /><h1 className="text-xl font-bold mb-2">{t("introuvable")}</h1><p className="text-sm text-muted-foreground">{t("introuvableDesc")}</p></div></div>;
  }

  const { artisan, vitrine, avis, avisStats, publicStats } = data;
  const ThemeIcon = SPEC_ICON[theme.iconKey];
  const hasRating = avisStats.total > 0;
  const themeLabel = t(theme.labelKey);
  const url = typeof window !== "undefined" ? window.location.href : null;
  const jsonLd = buildJsonLd(artisan, avisStats, avis, url, hasRating);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DocTitle title={t("titreOnglet", { nom: artisan.nomEntreprise, specialite: themeLabel })} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="#hero" className="flex items-center gap-2 min-w-0">
            {artisan.logo ? (<img src={artisan.logo} alt="" className="h-8 w-8 rounded object-contain shrink-0" />) : (<span className="h-8 w-8 rounded inline-flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: theme.hex }}>{initials}</span>)}
            <span className="font-semibold text-sm truncate">{artisan.nomEntreprise}</span>
          </a>
          <div className="hidden md:flex items-center gap-1">
            <a href="#about" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">{t("navApropos")}</a>
            <a href="#services" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">{t("navServices")}</a>
            <a href="#avis" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">{t("navAvis")}</a>
            <a href="#contact" className="px-3 py-1.5 text-sm hover:text-slate-900 text-slate-600 transition-colors">{t("navContact")}</a>
            <a href="#contact" className="ml-2 inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-semibold px-3.5 py-1.5 transition-all shadow-sm hover:shadow-md" style={{ backgroundColor: theme.hex }}>{t("navDevis")}</a>
          </div>
          <button type="button" className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded hover:bg-slate-100" onClick={() => setMobileMenuOpen((v) => !v)} aria-label={t("menu")}>{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
              <a onClick={() => setMobileMenuOpen(false)} href="#about" className="py-2 text-sm text-slate-700">{t("navApropos")}</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#services" className="py-2 text-sm text-slate-700">{t("navServices")}</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#avis" className="py-2 text-sm text-slate-700">{t("navAvis")}</a>
              <a onClick={() => setMobileMenuOpen(false)} href="#contact" className="py-2 text-sm text-slate-700">{t("navContact")}</a>
            </div>
          </div>
        )}
      </nav>

      <header id="hero" className={`pt-14 bg-gradient-to-br ${theme.gradient} text-white relative overflow-hidden`}>
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 pt-12 pb-16 md:pt-20 md:pb-24 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} className="mx-auto mb-6">
            {artisan.logo ? (<img src={artisan.logo} alt={artisan.nomEntreprise || ""} className="h-28 w-28 rounded-full object-contain bg-white border-4 border-white/30 shadow-xl mx-auto" />) : (<div className="h-28 w-28 rounded-full bg-white/15 backdrop-blur-sm border-4 border-white/30 flex items-center justify-center mx-auto shadow-xl"><span className="text-4xl font-bold">{initials}</span></div>)}
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{artisan.nomEntreprise}</h1>
          <p className="mt-2 text-white/90 inline-flex items-center gap-2"><ThemeIcon className="h-4 w-4" />{themeLabel}</p>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-1 text-xs font-medium"><BadgeCheck className="h-4 w-4 text-cyan-200" />{t("artisanVerifie")}</span>
            {hasRating && (<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-1 text-xs font-medium"><StarRating note={avisStats.moyenne} size="sm" color="#fde68a" /><span className="ml-1 font-bold">{avisStats.moyenne}/5</span><span className="text-white/80">({avisStats.total})</span></span>)}
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {artisan.telephone && (<a href={`tel:${artisan.telephone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-white text-slate-900 px-4 py-2.5 text-sm font-semibold shadow-md hover:shadow-lg transition-shadow"><Phone className="h-4 w-4" /> {t("appeler")}</a>)}
            <a href="#contact" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm border border-white/25 text-white px-4 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"><MessageSquare className="h-4 w-4" /> {t("envoyerMessage")}</a>
            <a href="#contact" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 text-amber-950 px-4 py-2.5 text-sm font-semibold shadow-md hover:bg-amber-300 transition-colors"><Send className="h-4 w-4" /> {t("demanderDevis")}</a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/85">
            {artisan.ville && (<span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {artisan.ville}</span>)}
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t("repond24h")}</span>
            {vitrine.experience && (<span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {t("ansExperience", { n: vitrine.experience })}</span>)}
          </div>
        </div>
      </header>

      <section className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: UsersIcon, value: publicStats.totalClients, label: t("statClients") },
            { icon: Star, value: hasRating ? `${avisStats.moyenne}/5` : "—", label: t("statNote") },
            { icon: CheckCircle2, value: publicStats.totalInterventions, label: t("statInterventions") },
            { icon: TrendingUp, value: annee ? t("depuis", { annee }) : t("proLocal"), label: t("statExperience") },
          ].map(({ icon: Icon, value, label }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="text-center">
              <Icon className="h-5 w-5 mx-auto mb-1" style={{ color: theme.hex }} />
              <p className="text-xl md:text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="about" className="bg-slate-50 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">{t("aProposDe", { nom: artisan.nomEntreprise })}</h2>
          <div className="prose prose-slate max-w-none">
            {vitrine.description ? (<p className="text-slate-700 leading-relaxed whitespace-pre-line">{vitrine.description}</p>) : (<p className="text-slate-500 italic">{t("proLocalDesc", { nom: artisan.nomEntreprise })}</p>)}
          </div>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            {vitrine.zone && (<div className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4"><MapPin className="h-5 w-5 mt-0.5 shrink-0" style={{ color: theme.hex }} /><div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("zoneIntervention")}</p><p className="text-sm font-medium text-slate-900 mt-1">{vitrine.zone}</p></div></div>)}
            {artisan.siret && (<div className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4"><Building className="h-5 w-5 mt-0.5 shrink-0" style={{ color: theme.hex }} /><div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("siret")}</p><p className="text-sm font-mono font-medium text-slate-900 mt-1">{artisan.siret}</p></div></div>)}
          </div>
        </div>
      </section>

      {vitrine.services.length > 0 && (
        <section id="services" className="bg-white py-12 md:py-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{t("nosServices")}</h2>
            <p className="text-slate-500 text-sm mb-8">{t("nosServicesDesc", { nom: artisan.nomEntreprise })}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vitrine.services.map((service, i) => (
                <motion.div key={`${service}-${i}`} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
                  <div className={`h-11 w-11 rounded-xl text-white inline-flex items-center justify-center shadow-md bg-gradient-to-br ${theme.gradient} mb-3`}><ThemeIcon className="h-5 w-5" /></div>
                  <p className="font-semibold text-slate-900">{service}</p>
                  <p className="text-xs text-slate-500 mt-1">{t("surDevis")}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="bg-slate-50 py-12">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">{t("nosRealisations")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((src, i) => (<button key={i} type="button" onClick={() => setLightboxIdx(i)} className="aspect-square rounded-xl overflow-hidden bg-slate-200 hover:opacity-90 transition-opacity"><img src={src} alt="" className="w-full h-full object-cover" /></button>))}
            </div>
            <AnimatePresence>
              {lightboxIdx !== null && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}><img src={photos[lightboxIdx]} alt="" className="max-w-full max-h-full object-contain" /></motion.div>)}
            </AnimatePresence>
          </div>
        </section>
      )}

      <section id="avis" className="bg-slate-50 py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">{t("avisClients")}</h2>
          {hasRating ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-6">
                <div className="grid md:grid-cols-3 gap-6 items-center">
                  <div className="text-center md:text-left">
                    <div className="text-5xl font-bold tabular-nums" style={{ color: theme.hex }}>{avisStats.moyenne.toFixed(1)}</div>
                    <StarRating note={avisStats.moyenne} size="lg" color={theme.hex} />
                    <p className="text-sm text-slate-500 mt-1">{t("baseSur", { n: avisStats.total })}</p>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((n) => {
                      const count = avisStats.distribution[n] || 0;
                      const pct = avisStats.total > 0 ? (count / avisStats.total) * 100 : 0;
                      return (<div key={n} className="flex items-center gap-2 text-xs"><span className="w-6 text-right text-slate-600">{n}★</span><div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: theme.hex }} /></div><span className="w-8 text-right text-slate-500 tabular-nums">{count}</span></div>);
                    })}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {avis.slice(0, 8).map((a, i) => (
                  <motion.article key={a.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-sm text-slate-900">{clientNameShort(a.clientNom)}</p>
                          {a.interventionId && (<span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> {t("verifie")}</span>)}
                        </div>
                        <p className="text-[11px] text-slate-500">{a.createdAt ? new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : ""}</p>
                      </div>
                      <StarRating note={a.note} size="sm" color={theme.hex} />
                    </div>
                    {a.commentaire && (<p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{a.commentaire}</p>)}
                    {a.reponseArtisan && (<div className="mt-3 pl-3 border-l-2" style={{ borderColor: theme.hex }}><p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{t("reponseDe", { nom: artisan.nomEntreprise })}</p><p className="text-sm text-slate-700 whitespace-pre-line">{a.reponseArtisan}</p></div>)}
                  </motion.article>
                ))}
              </div>
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500 leading-relaxed">
                <BadgeCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <p><span className="font-semibold text-slate-600">{t("gestionAvisTitre")}</span>{t("gestionAvisDesc")}</p>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500"><Star className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm">{t("pasEncoreAvis", { nom: artisan.nomEntreprise })}</p><p className="text-xs mt-1">{t("soyezPremier")}</p></div>
          )}
        </div>
      </section>

      <section id="contact" className="py-12 md:py-16 text-white" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{t("demanderDevisGratuit")}</h2>
          <p className="text-white/90 text-sm mb-6">{t("decrivezProjet", { nom: artisan.nomEntreprise })}</p>
          {contactSent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl bg-white text-slate-900 p-8 text-center shadow-xl">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-xl font-bold mb-2">{t("demandeEnvoyee")}</h3>
              <p className="text-sm text-slate-600">{t("demandeEnvoyeeDesc", { nom: artisan.nomEntreprise })}</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmitContact} className="rounded-2xl bg-white text-slate-900 p-5 md:p-6 shadow-xl space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label htmlFor="v-nom">{t("nom")}</Label><Input id="v-nom" required value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} /></div>
                <div><Label htmlFor="v-email">{t("email")}</Label><Input id="v-email" type="email" required value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label htmlFor="v-tel">{t("telephone")}</Label><Input id="v-tel" type="tel" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} /></div>
                <div>
                  <Label htmlFor="v-type">{t("typePrestation")}</Label>
                  <Select value={contactForm.type} onValueChange={(v) => setContactForm({ ...contactForm, type: v })}>
                    <SelectTrigger id="v-type"><SelectValue placeholder={t("selectionner")} /></SelectTrigger>
                    <SelectContent>
                      {vitrine.services.slice(0, 10).map((s, i) => (<SelectItem key={i} value={s}>{s}</SelectItem>))}
                      <SelectItem value="Autre">{t("autreDevis")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label htmlFor="v-msg">{t("votreMessage")}</Label><Textarea id="v-msg" rows={5} required minLength={10} placeholder={t("messagePlaceholder")} value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} /></div>
              <Button type="submit" className="w-full text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-shadow" style={{ backgroundColor: theme.hex }} disabled={submitContact.isPending}>{submitContact.isPending ? t("envoiEnCours") : (<><Send className="h-4 w-4 mr-2" /> {t("envoyerDemande")}</>)}</Button>
            </form>
          )}
        </div>
      </section>

      <footer className="bg-slate-900 text-slate-300 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-400" /><span>{t("propulsePar")} <span className="font-semibold text-white">{t("operioz")}</span></span></div>
          <a href="https://www.operioz.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">{t("creerVitrine")} <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
        <div className="max-w-5xl mx-auto px-4 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} {artisan.nomEntreprise}</span>
          <span>{t("mentionsFooter")}</span>
        </div>
      </footer>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="grid grid-cols-2 gap-2 p-2">
          {artisan.telephone ? (<a href={`tel:${artisan.telephone}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-slate-900 py-3 text-sm font-semibold"><Phone className="h-4 w-4" /> {t("appeler")}</a>) : (<a href="#contact" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-slate-900 py-3 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> {t("message")}</a>)}
          <a href="#contact" className="inline-flex items-center justify-center gap-1.5 rounded-lg text-white py-3 text-sm font-semibold shadow-md" style={{ backgroundColor: theme.hex }}><Send className="h-4 w-4" /> {t("devis")}</a>
        </div>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </div>
      <div className="md:hidden h-20" />
    </div>
  );
}
