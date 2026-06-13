import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Wrench, ArrowRight, Loader2, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [, setLocation] = useLocation();

  const forgotMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      // Reponse volontairement identique que l'email existe ou non.
      setSubmitted(true);
    },
    onError: () => {
      // Meme en cas d'erreur on n'expose rien : on affiche l'ecran de confirmation.
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Veuillez saisir votre email.");
      return;
    }
    forgotMutation.mutate({ email });
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
              Retour
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          {submitted ? (
            <>
              <CardHeader>
                <div className="flex justify-center mb-2">
                  <MailCheck className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="text-center">Vérifiez votre boîte mail</CardTitle>
                <CardDescription className="text-center">
                  Si un compte est associé à cette adresse, vous recevrez un email
                  contenant un lien pour réinitialiser votre mot de passe. Le lien
                  expire dans 1 heure.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setLocation("/signin")}>
                  Retour à la connexion
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Mot de passe oublié</CardTitle>
                <CardDescription>
                  Saisissez votre email, nous vous enverrons un lien de réinitialisation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="votre@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={forgotMutation.isPending}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotMutation.isPending}>
                    {forgotMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      "Envoyer le lien"
                    )}
                  </Button>
                </form>
                <div className="mt-6 text-center text-sm">
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => setLocation("/signin")}
                  >
                    Retour à la connexion
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
