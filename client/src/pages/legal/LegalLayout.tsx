import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

// Layout commun pour les 4 pages legales. Header simple avec back-button
// vers Home, contenu centre max-w-3xl, footer minimal.
export function LegalLayout({ title, lastUpdated, children }: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l'accueil
          </Link>
          <span className="text-sm font-semibold text-foreground">Operioz</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : {lastUpdated}</p>
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:underline">
          {children}
        </article>
      </main>
      <footer className="border-t border-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/mentions-legales" className="hover:text-foreground">Mentions légales</Link>
          <Link to="/cgu" className="hover:text-foreground">CGU</Link>
          <Link to="/cgv" className="hover:text-foreground">CGV</Link>
          <Link to="/confidentialite" className="hover:text-foreground">Confidentialité</Link>
          <span className="ml-auto">© {new Date().getFullYear()} Operioz</span>
        </div>
      </footer>
    </div>
  );
}
