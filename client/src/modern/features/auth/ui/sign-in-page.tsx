import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { AuthShell } from "./auth-shell";
import { useAuthForms } from "../application/use-auth-forms";
import { validateSignin } from "../domain/auth";

// Page `/signin` — migration clean-archi de `pages/SignIn.tsx`. Markup à l'identique.
export default function SignInPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signin } = useAuthForms();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateSignin(email, password);
    if (err) { toast.error(t(err)); return; }
    signin.mutate({ email, password }, {
      onSuccess: () => { toast.success(t("toastConnexion")); window.location.href = "/dashboard"; },
      onError: (error) => toast.error(error.message || t("errIdentifiants")),
    });
  };

  return (
    <AuthShell backHref="/" backLabel={t("retour")}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("connexion")}</CardTitle>
          <CardDescription>{t("connexionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={signin.isPending} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("motDePasse")}</Label>
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={signin.isPending} required />
            </div>
            <div className="text-right">
              <Button type="button" variant="link" className="p-0 h-auto text-sm" onClick={() => { window.location.href = "/forgot-password"; }}>{t("motDePasseOublie")}</Button>
            </div>
            <Button type="submit" className="w-full" disabled={signin.isPending}>
              {signin.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("connexionEnCours")}</> : t("seConnecter")}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{t("pasDeCompte")}</span>
            <Button variant="link" className="p-0 h-auto" onClick={() => { window.location.href = "/signup"; }}>{t("sInscrire")}</Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
