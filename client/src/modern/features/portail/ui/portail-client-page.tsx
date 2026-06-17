import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FileText, Receipt, Calendar, User, Loader2, Phone, Mail, MessageCircle, CalendarDays, HardHat, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { usePortailAccess } from "../application/use-portail-access";
import { PORTAIL_TABS } from "../domain/portail";

// SLICE 1 (socle) du portail client `/v2/portail/$token` : gate d'accès (chargement / lien invalide /
// espace valide) + en-tête artisan + coquille d'onglets. Contenu des onglets = slices ultérieurs.
// Composant additif PUBLIC, non lié au trafic réel tant que le backend n'a pas basculé les liens.
const TAB_ICON: Record<string, typeof FileText> = {
  demande: Sparkles, devis: FileText, factures: Receipt, interventions: Calendar,
  messages: MessageCircle, rdv: CalendarDays, chantier: HardHat, infos: User,
};
const TAB_LABEL: Record<string, { prefix?: string; label: string }> = {
  demande: { prefix: "tabDemandePrefix", label: "tabDemande" },
  devis: { prefix: "tabDevisPrefix", label: "tabDevis" },
  factures: { prefix: "tabFacturesPrefix", label: "tabFactures" },
  interventions: { prefix: "tabInterventionsPrefix", label: "tabInterventions" },
  messages: { label: "tabMessages" },
  rdv: { prefix: "tabRdvPrefix", label: "tabRdv" },
  chantier: { prefix: "tabChantierPrefix", label: "tabChantier" },
  infos: { prefix: "tabInfosPrefix", label: "tabInfos" },
};

export default function PortailClientPage() {
  const { t } = useTranslation("portail");
  const { token } = useParams({ strict: false }) as { token?: string };
  const [activeTab, setActiveTab] = useState("devis");
  const { access, isLoading } = usePortailAccess(token || "");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">{t("chargement")}</p>
        </div>
      </div>
    );
  }

  if (!access?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-red-600">{t("lienInvalideTitre")}</CardTitle>
            <CardDescription className="text-base">{t("lienInvalideDesc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {access.artisan?.logo && <img src={access.artisan.logo} alt="" className="h-10 w-10 rounded object-contain" />}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{access.artisan?.nomEntreprise || t("espaceClient")}</h1>
                <p className="text-gray-500 text-sm mt-1">{t("bienvenue", { prenom: access.client?.prenom ?? "", nom: access.client?.nom ?? "" })}</p>
              </div>
            </div>
            <div className="text-sm text-gray-500 sm:text-right">
              {access.artisan?.telephone && <p className="flex items-center gap-1 sm:justify-end"><Phone className="h-3.5 w-3.5" /> {access.artisan.telephone}</p>}
              {access.artisan?.email && <p className="flex items-center gap-1 sm:justify-end"><Mail className="h-3.5 w-3.5" /> {access.artisan.email}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-8 mb-6">
            {PORTAIL_TABS.map((tab) => {
              const Icon = TAB_ICON[tab];
              const meta = TAB_LABEL[tab];
              return (
                <TabsTrigger key={tab} value={tab} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Icon className={`h-4 w-4 ${tab === "demande" ? "text-violet-600" : ""}`} />
                  {meta.prefix && <span className="hidden sm:inline">{t(meta.prefix)}</span>}{t(meta.label)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {PORTAIL_TABS.map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("sectionAVenir")}</CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
