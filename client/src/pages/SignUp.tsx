import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Wrench, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [, setLocation] = useLocation();
  
  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: () => {
      toast.success("Inscription réussie");
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "Une erreur s'est produite.");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    signupMutation.mutate({ email, password, name: name || undefined });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">MonArtisan Pro</span>
          </div>
          <Button variant="outline" asChild>
            <a href="/">
              Retour
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Créer un compte</CardTitle>
            <CardDescription>
              Inscrivez-vous pour accéder à MonArtisan Pro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom (optionnel)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Votre nom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={signupMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={signupMutation.isPending}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={signupMutation.isPending}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={signupMutation.isPending}
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inscription en cours...
                  </>
                ) : (
                  "S'inscrire"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Vous avez déjà un compte ? </span>
              <Button 
                variant="link" 
                className="p-0 h-auto"
                onClick={() => setLocation("/signin")}
              >
                Se connecter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
