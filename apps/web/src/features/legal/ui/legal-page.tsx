import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { LegalDoc } from "../domain/legal-content";

/*
 * Coque + rendu d'une page légale statique (migration de `pages/legal/LegalLayout.tsx`). Le contenu est du
 * HTML de confiance (consts domain, aucune entrée utilisateur) → `dangerouslySetInnerHTML`. Markup identique.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation("legal");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />{t("retourAccueil")}
          </a>
          <span className="text-sm font-semibold text-foreground">{t("operioz")}</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{doc.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t("derniereMaj", { date: doc.lastUpdated })}</p>
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:underline" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </main>
      <footer className="border-t border-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <a href="/mentions-legales" className="hover:text-foreground">{t("mentionsLegales")}</a>
          <a href="/cgu" className="hover:text-foreground">{t("cgu")}</a>
          <a href="/cgv" className="hover:text-foreground">{t("cgv")}</a>
          <a href="/confidentialite" className="hover:text-foreground">{t("confidentialite")}</a>
          <span className="ml-auto">{t("copyright", { annee: new Date().getFullYear() })}</span>
        </div>
      </footer>
    </div>
  );
}
