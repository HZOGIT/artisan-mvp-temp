import { useTranslation } from "react-i18next";
import { Wrench, ArrowLeft } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { titleKeyForPath } from "../domain/page-construction";

// Page publique `/contact|aide|guide` — migration clean-archi de `pages/PageEnConstruction.tsx`. Markup
// à l'identique ; le titre dérive du chemin (domain pur).
export default function PageConstructionPage() {
  const { t } = useTranslation("pageConstruction");
  const title = t(titleKeyForPath(typeof window !== "undefined" ? window.location.pathname : "/"));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2"><Wrench className="h-7 w-7 text-[#2563EB]" /><span className="text-xl font-bold text-[#1F2937]">{t("operioz")}</span></a>
          <Button variant="outline" asChild><a href="/"><ArrowLeft className="mr-2 h-4 w-4" />{t("retour")}</a></Button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-[#EFF6FF] flex items-center justify-center mx-auto mb-6"><Wrench className="h-8 w-8 text-[#2563EB]" /></div>
          <h1 className="text-2xl font-bold text-[#1F2937] mb-3">{title}</h1>
          <p className="text-[#6B7280] mb-8">{t("enConstruction")}</p>
          <Button asChild className="bg-[#2563EB] hover:bg-[#1D4ED8]"><a href="/">{t("retourAccueil")}</a></Button>
        </div>
      </div>
    </div>
  );
}
