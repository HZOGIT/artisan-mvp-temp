import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Wrench, FileText, Users, Calendar, BarChart3, Bell, ArrowRight } from "lucide-react";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated && !loading) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const features = [
    {
      icon: Users,
      title: "Gestion des Clients",
      description: "Centralisez toutes les informations de vos clients en un seul endroit."
    },
    {
      icon: FileText,
      title: "Devis & Factures",
      description: "Créez des devis professionnels et transformez-les en factures en un clic."
    },
    {
      icon: Calendar,
      title: "Planification",
      description: "Planifiez et suivez vos interventions avec un calendrier intuitif."
    },
    {
      icon: BarChart3,
      title: "Tableau de Bord",
      description: "Visualisez vos performances et suivez votre chiffre d'affaires."
    },
    {
      icon: Wrench,
      title: "Bibliothèque d'Articles",
      description: "Accédez à plus de 250 articles prédéfinis pour plomberie et électricité."
    },
    {
      icon: Bell,
      title: "Notifications",
      description: "Restez informé des échéances et des actions à effectuer."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">Artisan MVP</span>
          </div>
          <Button asChild>
            <a href={getLoginUrl()}>
              Se connecter
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Gérez votre activité d'artisan
            <span className="block text-primary">simplement et efficacement</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Une solution complète pour les plombiers, électriciens et chauffagistes. 
            Gérez vos clients, devis, factures et interventions depuis une seule plateforme.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <a href={getLoginUrl()}>
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground">
              Tout ce dont vous avez besoin
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Des outils pensés pour simplifier votre quotidien d'artisan
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Métiers Section */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground">
              Adapté à votre métier
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Une bibliothèque d'articles spécialisée pour chaque corps de métier
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔧</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Plomberie</h3>
              <p className="text-muted-foreground">
                100 articles prédéfinis : robinetterie, tuyauterie, sanitaires, chauffe-eau...
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚡</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Électricité</h3>
              <p className="text-muted-foreground">
                150 articles prédéfinis : tableau électrique, câblage, éclairage, domotique...
              </p>
            </div>
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔥</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Chauffage</h3>
              <p className="text-muted-foreground">
                Gérez vos interventions de chauffage avec les articles adaptés à votre activité.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="bg-primary rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-primary-foreground mb-4">
              Prêt à simplifier votre gestion ?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              Rejoignez les artisans qui ont déjà adopté Artisan MVP pour gérer leur activité au quotidien.
            </p>
            <Button size="lg" variant="secondary" asChild>
              <a href={getLoginUrl()}>
                Créer mon compte
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-6 w-6 text-primary" />
              <span className="font-semibold text-foreground">Artisan MVP</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Artisan MVP. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
