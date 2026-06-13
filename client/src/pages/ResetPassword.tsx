import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Wrench, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [, setLocation] = useLocation();

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true);
      toast.success("Mot de passe réinitialisé.");
    },
    onError: (error) => {
      toast.error(error.message || "Lien invalide ou expiré.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    resetMutation.mutate({ token, newPassword: password });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">Operioz</span>
          </div>
          <Button variant="outline" asChild>
            <a href="/signin">
              Connexion
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          {!token ? (
            <>
              <CardHeader>
                <CardTitle>Lien invalide</CardTitle>
                <CardDescription>
                  Ce lien de réinitialisation est incomplet ou invalide. Veuillez
                  refaire une demande.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setLocation("/forgot-password")}>
                  Demander un nouveau lien
                </Button>
              </CardContent>
            </>
          ) : done ? (
            <>
              <CardHeader>
                <div className="flex justify-center mb-2">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <CardTitle className="text-center">Mot de passe modifié</CardTitle>
                <CardDescription className="text-center">
                  Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setLocation("/signin")}>
                  Se connecter
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Nouveau mot de passe</CardTitle>
                <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Nouveau mot de passe</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={resetMutation.isPending}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                    <Input
                      id="confirm"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={resetMutation.isPending}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
                    {resetMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Modification...
                      </>
                    ) : (
                      "Réinitialiser le mot de passe"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
