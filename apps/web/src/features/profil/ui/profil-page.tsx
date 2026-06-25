import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building, Phone, Mail, MapPin, Save, CreditCard, KeyRound, AlertTriangle, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/ui/alert-dialog";
import { Switch } from "@/shared/ui/switch";
import { TVA_CATEGORIES } from "@/shared/tva/taux-tva-fr";
import { useProfil, useAccountSettings } from "../application/use-profil";
import { defaultProfilForm, formFromArtisan, buildUpdatePayload, passwordStrength, validateEmailChange, validatePasswordChange, SOCIETE_FORMES, FORME_OPTIONS, METIERS_IA, type ProfilForm, type Specialite, type FormeJuridique } from "../domain/profil";

/*
 * Page `/profil` — migration clean-archi de `pages/Profil.tsx`. Markup à l'identique. Mapping form↔profil
 * + validations en domain (pur, testé) ; l'objet profil expose désormais TOUS les champs (les casts legacy ont été supprimés).
 */
export default function ProfilPage() {
  const { t } = useTranslation("profil");
  const { artisan, isLoading, updateProfile } = useProfil();
  const [form, setForm] = useState<ProfilForm>(defaultProfilForm);

  useEffect(() => { if (artisan) setForm(formFromArtisan(artisan)); }, [artisan]);

  const set = <K extends keyof ProfilForm>(key: K, value: ProfilForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(buildUpdatePayload(form), {
      onSuccess: () => toast.success(t("toastProfilOk")),
      onError: () => toast.error(t("errProfil")),
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const isSociete = SOCIETE_FORMES.includes(form.formeJuridique as FormeJuridique);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("titre")}</h1>
        <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />{t("infosEntreprise")}</CardTitle>
            <CardDescription>{t("infosEntrepriseDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="nomEntreprise">{t("raisonSociale")}</Label><Input id="nomEntreprise" value={form.nomEntreprise} onChange={(e) => set("nomEntreprise", e.target.value)} placeholder={t("raisonSocialePlaceholder")} /></div>
              <div className="space-y-2"><Label htmlFor="siret">{t("siret")}</Label><Input id="siret" value={form.siret} onChange={(e) => set("siret", e.target.value)} placeholder="123 456 789 00012" /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="numeroTVA">{t("numeroTVA")}</Label><Input id="numeroTVA" value={form.numeroTVA} onChange={(e) => set("numeroTVA", e.target.value)} placeholder="FR 12 345678901" /></div>
              <div className="space-y-2"><Label htmlFor="codeAPE">{t("codeAPE")}</Label><Input id="codeAPE" value={form.codeAPE} onChange={(e) => set("codeAPE", e.target.value)} placeholder="4322A" /></div>
              <div className="space-y-2">
                <Label htmlFor="formeJuridique">{t("formeJuridique")}</Label>
                <select id="formeJuridique" value={form.formeJuridique} onChange={(e) => set("formeJuridique", e.target.value as FormeJuridique | "")} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORME_OPTIONS.map((o) => (<option key={o.value || "none"} value={o.value}>{t(o.labelKey)}</option>))}
                </select>
              </div>
              {isSociete && (
                <>
                  <div className="space-y-2"><Label htmlFor="capitalSocial">{t("capitalSocial")}</Label><Input id="capitalSocial" type="number" min="0" step="0.01" value={form.capitalSocial} onChange={(e) => set("capitalSocial", e.target.value)} placeholder="10000" /></div>
                  <div className="space-y-2"><Label htmlFor="villeRCS">{t("villeRCS")}</Label><Input id="villeRCS" value={form.villeRCS} onChange={(e) => set("villeRCS", e.target.value)} placeholder="Lyon" /></div>
                </>
              )}
              <div className="space-y-2"><Label htmlFor="numeroRM">{t("numeroRM")}</Label><Input id="numeroRM" value={form.numeroRM} onChange={(e) => set("numeroRM", e.target.value)} placeholder={t("numeroRMPlaceholder")} /></div>
              <div className="space-y-2">
                <Label>{t("specialite")}</Label>
                <Select value={form.specialite} onValueChange={(v) => set("specialite", v as Specialite)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plomberie">{t("specPlomberie")}</SelectItem>
                    <SelectItem value="electricite">{t("specElectricite")}</SelectItem>
                    <SelectItem value="chauffage">{t("specChauffage")}</SelectItem>
                    <SelectItem value="multi-services">{t("specMulti")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <Label className="flex items-center gap-2"><span className="text-violet-700">🎯</span><span>{t("metierTitre")}</span></Label>
              <p className="text-xs text-muted-foreground">{t("metierDesc")}</p>
              <Select value={form.metier || "__none__"} onValueChange={(v) => set("metier", v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-white"><SelectValue placeholder={t("metierNonPrecise")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("metierNonPrecise")}</SelectItem>
                  {METIERS_IA.map((m) => (<SelectItem key={m.key} value={m.key}>{t(m.labelKey)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t("tauxTVA")}</Label>
                <Select value={form.tauxTVA} onValueChange={(v) => set("tauxTVA", v)} disabled={form.franchiseTVA}>
                  <SelectTrigger className="max-w-[280px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{TVA_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.taux}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="franchiseTVA" checked={form.franchiseTVA} onCheckedChange={(v) => { set("franchiseTVA", v); if (v) set("tauxTVA", "0"); }} />
                <Label htmlFor="franchiseTVA" className="cursor-pointer">{t("franchiseTVA")}</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" />{t("coordonnees")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="telephone">{t("telephone")}</Label><Input id="telephone" type="tel" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="06 12 34 56 78" /></div>
              <div className="space-y-2"><Label htmlFor="email">{t("email")}</Label><Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("emailPlaceholder")} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />{t("adresse")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="adresse">{t("adresse")}</Label><Input id="adresse" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} placeholder="123 rue de la Plomberie" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="codePostal">{t("codePostal")}</Label><Input id="codePostal" value={form.codePostal} onChange={(e) => set("codePostal", e.target.value)} placeholder="75001" /></div>
              <div className="space-y-2"><Label htmlFor="ville">{t("ville")}</Label><Input id="ville" value={form.ville} onChange={(e) => set("ville", e.target.value)} placeholder="Paris" /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t("infosBancaires")}</CardTitle>
            <CardDescription>{t("infosBancairesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2"><Label htmlFor="iban">{t("iban")}</Label><Input id="iban" value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="FR76 1234 5678 9012 3456 7890 123" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{t("assuranceDecennale")}</CardTitle>
            <CardDescription>{t("assuranceDecennaleDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="assuranceDecennaleNom">{t("assureurDecennale")}</Label><Input id="assuranceDecennaleNom" value={form.assuranceDecennaleNom} onChange={(e) => set("assuranceDecennaleNom", e.target.value)} placeholder={t("assureurDecennalePlaceholder")} /></div>
              <div className="space-y-2"><Label htmlFor="assuranceDecennalePolice">{t("policeDecennale")}</Label><Input id="assuranceDecennalePolice" value={form.assuranceDecennalePolice} onChange={(e) => set("assuranceDecennalePolice", e.target.value)} placeholder={t("policeDecennalePlaceholder")} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="assuranceDecennaleGarantie">{t("zoneGarantieDecennale")}</Label><Input id="assuranceDecennaleGarantie" value={form.assuranceDecennaleGarantie} onChange={(e) => set("assuranceDecennaleGarantie", e.target.value)} placeholder={t("zoneGarantieDecennalePlaceholder")} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateProfile.isPending}><Save className="h-4 w-4 mr-2" />{updateProfile.isPending ? t("enregistrement") : t("enregistrer")}</Button>
        </div>
      </form>

      <AccountSettings />
    </div>
  );
}

/** 3 cartes : email, mot de passe, zone de danger. Hors du form principal (handlers dédiés). */
function AccountSettings() {
  const { t } = useTranslation("profil");
  const { currentEmail, updateEmail, updatePassword, deleteAccount } = useAccountSettings();
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const handleUpdateEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateEmailChange(newEmail, confirmEmail, currentEmail);
    if (err) { toast[err === "errEmailSame" ? "info" : "error"](t(err)); return; }
    updateEmail.mutate({ newEmail: newEmail.trim() }, { onSuccess: () => { toast.success(t("toastEmailOk")); setNewEmail(""); setConfirmEmail(""); }, onError: (e2) => toast.error(e2.message || t("errEmail")) });
  };

  const strength = passwordStrength(newPassword);
  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (err) { toast.error(t(err)); return; }
    updatePassword.mutate({ currentPassword, newPassword }, { onSuccess: () => { toast.success(t("toastMdpOk")); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }, onError: (e2) => toast.error(e2.message || t("errMdp")) });
  };

  const handleDelete = () => {
    if (deleteConfirm !== "SUPPRIMER") { toast.error(t("errConfirmSuppr")); return; }
    deleteAccount.mutate({ confirmation: deleteConfirm }, { onSuccess: () => { toast.success(t("toastCompteSupprime")); window.location.href = "/sign-in"; }, onError: (e2) => toast.error(e2.message || t("errSuppression")) });
  };

  return (
    <div className="space-y-6 mt-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />{t("adresseEmail")}</CardTitle>
          <CardDescription>{t("adresseEmailDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateEmail} className="space-y-4">
            <div><Label className="text-xs text-muted-foreground">{t("emailActuel")}</Label><Input value={currentEmail} disabled className="mt-1 bg-muted/40" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label htmlFor="newEmail">{t("nouvelEmail")}</Label><Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="nouveau@exemple.com" className="mt-1" /></div>
              <div><Label htmlFor="confirmEmail">{t("confirmerNouvelEmail")}</Label><Input id="confirmEmail" type="email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="nouveau@exemple.com" className="mt-1" /></div>
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={!newEmail || !confirmEmail || updateEmail.isPending}>{updateEmail.isPending ? t("majEnCours") : t("majEmail")}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />{t("motDePasse")}</CardTitle>
          <CardDescription>{t("motDePasseDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div><Label htmlFor="currentPassword">{t("mdpActuel")}</Label><Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className="mt-1" /></div>
            <div>
              <Label htmlFor="newPassword">{t("nouveauMdp")}</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="mt-1" />
              {newPassword.length > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${strength.color} transition-all`} style={{ width: `${strength.pct}%` }} /></div>
                  <p className={`text-[11px] mt-1 font-medium ${strength.color === "bg-rose-500" ? "text-rose-600 dark:text-rose-400" : strength.color === "bg-amber-500" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{strength.labelKey ? t(strength.labelKey) : ""}</p>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="confirmPassword">{t("confirmerNouveauMdp")}</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="mt-1" />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (<p className="text-[11px] mt-1 text-rose-600 dark:text-rose-400">{t("mdpMismatch")}</p>)}
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={!currentPassword || !newPassword || !confirmPassword || updatePassword.isPending}>{updatePassword.isPending ? t("majEnCours") : t("majMdp")}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-300"><AlertTriangle className="h-5 w-5" />{t("zoneDanger")}</CardTitle>
          <CardDescription className="text-rose-700/80 dark:text-rose-300/80">{t("zoneDangerDesc")}</CardDescription>
        </CardHeader>
        <CardContent><Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4 mr-2" />{t("supprimerCompte")}</Button></CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle className="h-5 w-5" />{t("dialogSupprTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{t("dialogSupprActionIrreversible")}</strong>{t("dialogSupprDesc")}
              <br /><br />
              {t("dialogSupprConfirme")} <strong className="font-mono text-foreground">{t("motSupprimer")}</strong> {t("enMajuscules")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="SUPPRIMER" className="font-mono" autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteConfirm !== "SUPPRIMER" || deleteAccount.isPending} className="bg-rose-600 hover:bg-rose-700 text-white">{deleteAccount.isPending ? t("suppression") : t("confirmerSuppression")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
