import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AuthShell } from "./auth-shell";
import { useAuthForms } from "../application/use-auth-forms";
import { validateSignup } from "../domain/auth";

/** Page `/signup` — migration clean-archi de `pages/SignUp.tsx`. Markup à l'identique. */
export default function SignUpPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const { signup } = useAuthForms();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateSignup(email, password, confirmPassword);
    if (err) { toast.error(t(err)); return; }
    signup.mutate({ email, password, name: name || undefined }, {
      onSuccess: () => { toast.success(t("toastInscription")); window.location.href = "/dashboard"; },
      onError: (error) => toast.error(error.message || t("errInscription")),
    });
  };

  return (
    <AuthShell backHref="/" backLabel={t("retour")}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("inscription")}</CardTitle>
          <CardDescription>{t("inscriptionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("nomOptionnel")}</Label>
              <Input id="name" placeholder={t("nomPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} disabled={signup.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={signup.isPending} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("motDePasse")}</Label>
              <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={signup.isPending} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("confirmerMotDePasse")}</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={signup.isPending} required />
            </div>
            <Button type="submit" className="w-full" disabled={signup.isPending}>
              {signup.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("inscriptionEnCours")}</> : t("creerCompte")}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{t("dejaCompte")}</span>
            <Button variant="link" className="p-0 h-auto" onClick={() => { window.location.href = "/signin"; }}>{t("connexion")}</Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
