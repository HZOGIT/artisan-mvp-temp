import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 p-4">
      <div className="max-w-md text-center">
        {/* Illustration SVG simple — 404 dans un dégradé bleu/indigo */}
        <div className="relative inline-block mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 200"
            className="h-40 w-40 mx-auto"
            aria-hidden
          >
            <defs>
              <linearGradient id="g404" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="80" fill="url(#g404)" opacity="0.1" />
            <circle cx="100" cy="100" r="60" fill="url(#g404)" opacity="0.15" />
            <text
              x="100"
              y="118"
              textAnchor="middle"
              fontSize="64"
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
              fill="url(#g404)"
            >
              404
            </text>
          </svg>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Cette page n'existe pas ou a été déplacée.
          <br />
          Vérifiez l'URL ou retournez à votre tableau de bord.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <Button onClick={() => setLocation("/dashboard")} className="gap-2">
            <Home className="h-4 w-4" /> Tableau de bord
          </Button>
        </div>

        <p className="mt-8 text-xs text-slate-500 inline-flex items-center gap-1.5">
          <Search className="h-3 w-3" />
          Besoin d'aide ? Tapez votre demande dans MonAssistant.
        </p>
      </div>
    </div>
  );
}
