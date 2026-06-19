import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSupport } from "../application/use-support";
import { isContactValid, SUJETS, type Sujet } from "../domain/support";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion";
import { Mail, BookOpen, Sparkles, Send, MessageCircle, Loader2 } from "lucide-react";
import { Link } from "@/shared/router/navigation";
import { toast } from "sonner";

/*
 * Page Centre d'aide / Support du FRONT NEUF (`/support`) — MIGRATION clean-archi de `pages/Support.tsx`
 * (legacy chaînes EN DUR + FAQ inline → i18n namespace `support`, FAQ via `returnObjects`). Mutation via
 * `useSupport` (couche application, seule à importer tRPC) ; validation via le domaine (pure & testée).
 * Présentation pure, 0 `any`.
 */

const SUJET_LABEL: Record<Sujet, string> = {
  technique: "sujetTechnique",
  facturation: "sujetFacturation",
  suggestion: "sujetSuggestion",
  autre: "sujetAutre",
};

export default function SupportPage() {
  const { t } = useTranslation("support");
  const { contact: contactMut } = useSupport();
  const [formData, setFormData] = useState<{ nom: string; email: string; sujet: Sujet; message: string }>({
    nom: "",
    email: "",
    sujet: "technique",
    message: "",
  });

  const faq = t("faq", { returnObjects: true }) as ReadonlyArray<{ q: string; r: string }>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isContactValid(formData)) {
      toast.error(t("toastRequired"));
      return;
    }
    contactMut.mutate(formData, {
      onSuccess: () => {
        toast.success(t("toastSent"));
        setFormData({ nom: "", email: "", sujet: "technique", message: "" });
      },
      onError: (e) => toast.error(e.message || t("toastError")),
    });
  };

  const openAssistant = () => {
    window.dispatchEvent(new CustomEvent("operioz:open-assistant"));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-8">
        <h1 className="text-3xl font-bold">{t("headerTitle")}</h1>
        <p className="text-blue-100 mt-2 text-base">{t("headerSubtitle")}</p>
      </div>

      {/* SECTION 2 : Canaux de contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 mb-2">
              <Mail className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">{t("channelEmailTitle")}</CardTitle>
            <CardDescription>{t("channelEmailDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button asChild variant="outline" className="w-full">
              <a href="mailto:support@operioz.com">{t("channelEmailBtn")}</a>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 mb-2">
              <BookOpen className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">{t("channelGuideTitle")}</CardTitle>
            <CardDescription>{t("channelGuideDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button asChild variant="outline" className="w-full">
              <Link to="/documentation">{t("channelGuideBtn")}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-600 mb-2">
              <Sparkles className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">{t("channelAssistantTitle")}</CardTitle>
            <CardDescription>{t("channelAssistantDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-end">
            <Button onClick={openAssistant} variant="outline" className="w-full">
              {t("channelAssistantBtn")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3 : FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>{t("faqTitle")}</CardTitle>
          <CardDescription>{t("faqDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faq.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.r}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* SECTION 4 : Formulaire de contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t("contactTitle")}
          </CardTitle>
          <CardDescription>{t("contactDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">{t("nomLabel")}</Label>
                <Input
                  id="nom"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sujet">{t("sujetLabel")}</Label>
              <Select value={formData.sujet} onValueChange={(v) => setFormData({ ...formData, sujet: v as Sujet })}>
                <SelectTrigger id="sujet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUJETS.map((s) => (
                    <SelectItem key={s} value={s}>{t(SUJET_LABEL[s])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">{t("messageLabel")}</Label>
              <Textarea
                id="message"
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                placeholder={t("messagePlaceholder")}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={contactMut.isPending}>
                {contactMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("sending")}</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> {t("send")}</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
