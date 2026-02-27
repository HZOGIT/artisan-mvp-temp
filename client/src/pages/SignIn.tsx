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

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  
  const signinMutation = trpc.auth.signin.useMutation({
    onSuccess: () => {
      toast.success("Connexion réussie");
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "Email ou mot de passe incorrect.");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }

    signinMutation.mutate({ email, password });
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
            <CardTitle>Connexion</CardTitle>
            <CardDescription>
              Entrez vos identifiants pour accéder à votre compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={signinMutation.isPending}
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
                  disabled={signinMutation.isPending}
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={signinMutation.isPending}
              >
                {signinMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Pas encore de compte ? </span>
              <Button 
                variant="link" 
                className="p-0 h-auto"
                onClick={() => setLocation("/signup")}
              >
                S'inscrire
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
