import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { AuthShell } from "./auth-shell";
import { useAuthForms } from "../application/use-auth-forms";
import { validateReset, tokenFromSearch } from "../domain/auth";

// Page `/v2/reset-password` — migration clean-archi de `pages/ResetPassword.tsx`. Markup à l'identique.
export default function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const token = tokenFromSearch(typeof window !== "undefined" ? window.location.search : "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const { resetPassword } = useAuthForms();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateReset(password, confirm);
    if (err) { toast.error(t(err)); return; }
    resetPassword.mutate({ token, newPassword: password }, {
      onSuccess: () => { setDone(true); toast.success(t("toastReinitialise")); },
      onError: (error) => toast.error(error.message || t("errLienExpire")),
    });
  };

  return (
    <AuthShell backHref="/signin" backLabel={t("connexion")}>
      <Card className="w-full max-w-md">
        {!token ? (
          <>
            <CardHeader>
              <CardTitle>{t("lienInvalide")}</CardTitle>
              <CardDescription>{t("lienInvalideDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => { window.location.href = "/forgot-password"; }}>{t("demanderNouveauLien")}</Button>
            </CardContent>
          </>
        ) : done ? (
          <>
            <CardHeader>
              <div className="flex justify-center mb-2"><CheckCircle2 className="h-12 w-12 text-green-600" /></div>
              <CardTitle className="text-center">{t("motDePasseModifie")}</CardTitle>
              <CardDescription className="text-center">{t("motDePasseModifieDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => { window.location.href = "/signin"; }}>{t("seConnecter")}</Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t("nouveauMotDePasse")}</CardTitle>
              <CardDescription>{t("nouveauMotDePasseDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t("nouveauMotDePasse")}</Label>
                  <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={resetPassword.isPending} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{t("confirmerMotDePasse")}</Label>
                  <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={resetPassword.isPending} required />
                </div>
                <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
                  {resetPassword.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("modification")}</> : t("reinitialiser")}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
