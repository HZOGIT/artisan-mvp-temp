import { Button } from "@/components/ui/button";
import { Wrench, ArrowLeft } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/mentions-legales": "Mentions légales",
  "/cgv": "Conditions Générales de Vente",
  "/confidentialite": "Politique de confidentialité",
  "/contact": "Contact",
  "/aide": "Centre d'aide",
  "/guide": "Guide d'utilisation",
};

export default function PageEnConstruction() {
  const path = window.location.pathname;
  const title = pageTitles[path] || "Page";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <Wrench className="h-7 w-7 text-[#2563EB]" />
            <span className="text-xl font-bold text-[#1F2937]">MonArtisan Pro</span>
          </a>
          <Button variant="outline" asChild>
            <a href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </a>
          </Button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-[#EFF6FF] flex items-center justify-center mx-auto mb-6">
            <Wrench className="h-8 w-8 text-[#2563EB]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1F2937] mb-3">{title}</h1>
          <p className="text-[#6B7280] mb-8">
            Cette page est en cours de construction. Elle sera disponible prochainement.
          </p>
          <Button asChild className="bg-[#2563EB] hover:bg-[#1D4ED8]">
            <a href="/">Retour à l'accueil</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
