import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { AuthShell } from "./auth-shell";
import { useAuthForms } from "../application/use-auth-forms";

// Page `/forgot-password` — migration clean-archi de `pages/ForgotPassword.tsx`. Markup à l'identique.
export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { forgotPassword } = useAuthForms();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error(t("errEmailRequis")); return; }
    // Réponse volontairement identique que l'email existe ou non (succès comme erreur → écran confirmé).
    forgotPassword.mutate({ email }, { onSuccess: () => setSubmitted(true), onError: () => setSubmitted(true) });
  };

  return (
    <AuthShell backHref="/signin" backLabel={t("retour")}>
      <Card className="w-full max-w-md">
        {submitted ? (
          <>
            <CardHeader>
              <div className="flex justify-center mb-2"><MailCheck className="h-12 w-12 text-primary" /></div>
              <CardTitle className="text-center">{t("verifierMail")}</CardTitle>
              <CardDescription className="text-center">{t("verifierMailDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => { window.location.href = "/signin"; }}>{t("retourConnexion")}</Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t("motDePasseOublieTitre")}</CardTitle>
              <CardDescription>{t("motDePasseOublieDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={forgotPassword.isPending} required />
                </div>
                <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
                  {forgotPassword.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("envoiEnCours")}</> : t("envoyerLien")}
                </Button>
              </form>
              <div className="mt-6 text-center text-sm">
                <Button variant="link" className="p-0 h-auto" onClick={() => { window.location.href = "/signin"; }}>{t("retourConnexion")}</Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
