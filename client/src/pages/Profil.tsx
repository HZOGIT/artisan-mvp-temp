import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building, Phone, Mail, MapPin, Save, CreditCard, KeyRound, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Profil() {
  const [formData, setFormData] = useState({
    nomEntreprise: "",
    siret: "",
    numeroTVA: "",
    codeAPE: "",
    specialite: "plomberie" as string,
    telephone: "",
    email: "",
    adresse: "",
    codePostal: "",
    ville: "",
    tauxTVA: "20.00",
    iban: "",
  });

  const { data: artisan, isLoading } = trpc.artisan.getProfile.useQuery();

  const updateMutation = trpc.artisan.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profil mis à jour avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du profil");
    },
  });

  useEffect(() => {
    if (artisan) {
      setFormData({
        nomEntreprise: artisan.nomEntreprise || "",
        siret: artisan.siret || "",
        numeroTVA: (artisan as any).numeroTVA || "",
        codeAPE: (artisan as any).codeAPE || "",
        specialite: artisan.specialite || "plomberie",
        telephone: artisan.telephone || "",
        email: artisan.email || "",
        adresse: artisan.adresse || "",
        codePostal: artisan.codePostal || "",
        ville: artisan.ville || "",
        tauxTVA: artisan.tauxTVA || "20.00",
        iban: (artisan as any).iban || "",
      });
    }
  }, [artisan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Mon profil</h1>
        <p className="text-muted-foreground mt-1">
          Gérez les informations de votre entreprise
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informations entreprise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Informations entreprise
            </CardTitle>
            <CardDescription>
              Ces informations apparaîtront sur vos devis et factures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nomEntreprise">Raison sociale</Label>
                <Input
                  id="nomEntreprise"
                  value={formData.nomEntreprise}
                  onChange={(e) => setFormData({ ...formData, nomEntreprise: e.target.value })}
                  placeholder="Nom de votre entreprise"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siret">SIRET</Label>
                <Input
                  id="siret"
                  value={formData.siret}
                  onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                  placeholder="123 456 789 00012"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="numeroTVA">N° TVA intracommunautaire</Label>
                <Input
                  id="numeroTVA"
                  value={formData.numeroTVA}
                  onChange={(e) => setFormData({ ...formData, numeroTVA: e.target.value })}
                  placeholder="FR 12 345678901"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codeAPE">Code APE / NAF</Label>
                <Input
                  id="codeAPE"
                  value={formData.codeAPE}
                  onChange={(e) => setFormData({ ...formData, codeAPE: e.target.value })}
                  placeholder="4322A"
                />
              </div>
              <div className="space-y-2">
                <Label>Spécialité</Label>
                <Select
                  value={formData.specialite}
                  onValueChange={(v) => setFormData({ ...formData, specialite: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plomberie">Plomberie</SelectItem>
                    <SelectItem value="electricite">Électricité</SelectItem>
                    <SelectItem value="chauffage">Chauffage</SelectItem>
                    <SelectItem value="multi-services">Multi-services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tauxTVA">Taux de TVA par défaut (%)</Label>
              <Input
                id="tauxTVA"
                type="number"
                step="0.01"
                className="max-w-[200px]"
                value={formData.tauxTVA}
                onChange={(e) => setFormData({ ...formData, tauxTVA: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Coordonnées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Coordonnées
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input
                  id="telephone"
                  type="tel"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@entreprise.fr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Adresse */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                placeholder="123 rue de la Plomberie"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codePostal">Code postal</Label>
                <Input
                  id="codePostal"
                  value={formData.codePostal}
                  onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                  placeholder="75001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville</Label>
                <Input
                  id="ville"
                  value={formData.ville}
                  onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                  placeholder="Paris"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informations bancaires */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Informations bancaires
            </CardTitle>
            <CardDescription>
              L'IBAN sera affiché sur vos factures pour faciliter le paiement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                placeholder="FR76 1234 5678 9012 3456 7890 123"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>

      {/* Gestion des identifiants — hors du form principal pour eviter les
          soumissions parasites. Chaque section a son propre handler. */}
      <AccountSettings />
    </div>
  );
}

// ============================================================================
// AccountSettings — 3 cards : Email, Mot de passe, Zone de danger
// ============================================================================

function AccountSettings() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ── Email ─────────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const updateEmailMutation = trpc.auth.updateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email mis à jour");
      setNewEmail("");
      setConfirmEmail("");
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message || "Impossible de modifier l'email"),
  });
  const handleUpdateEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail !== confirmEmail) {
      toast.error("Les deux emails ne correspondent pas");
      return;
    }
    if ((user as any)?.email === newEmail.trim()) {
      toast.info("Cet email est déjà votre email actuel");
      return;
    }
    updateEmailMutation.mutate({ newEmail: newEmail.trim() });
  };

  // ── Mot de passe ──────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const updatePasswordMutation = trpc.auth.updatePassword.useMutation({
    onSuccess: () => {
      toast.success("Mot de passe mis à jour");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(err.message || "Impossible de modifier le mot de passe"),
  });
  const passwordStrength = (() => {
    if (newPassword.length === 0) return { label: "", pct: 0, color: "bg-muted" };
    if (newPassword.length < 6) return { label: "Faible", pct: 30, color: "bg-rose-500" };
    if (newPassword.length <= 8) return { label: "Moyen", pct: 60, color: "bg-amber-500" };
    return { label: "Fort", pct: 100, color: "bg-emerald-500" };
  })();
  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Le nouveau mot de passe doit faire au moins 6 caractères");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les deux mots de passe ne correspondent pas");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Le nouveau mot de passe doit être différent de l'actuel");
      return;
    }
    updatePasswordMutation.mutate({ currentPassword, newPassword });
  };

  // ── Suppression du compte ─────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Compte supprimé");
      // Le serveur a deja vidé le cookie ; on clear le cache et on redirige.
      utils.invalidate();
      setLocation("/sign-in");
    },
    onError: (err) => toast.error(err.message || "Impossible de supprimer le compte"),
  });
  const handleDeleteAccount = () => {
    if (deleteConfirm !== "SUPPRIMER") {
      toast.error("Tapez SUPPRIMER en majuscules pour confirmer");
      return;
    }
    deleteAccountMutation.mutate({ confirmation: deleteConfirm });
  };

  return (
    <div className="space-y-6 mt-8">
      {/* ───── CARD : Email ───── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Adresse email
          </CardTitle>
          <CardDescription>
            Votre email sert à vous connecter et recevoir les notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateEmail} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Email actuel</Label>
              <Input value={(user as any)?.email || ""} disabled className="mt-1 bg-muted/40" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="newEmail">Nouvel email</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nouveau@exemple.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confirmEmail">Confirmer le nouvel email</Label>
                <Input
                  id="confirmEmail"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="nouveau@exemple.com"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  !newEmail ||
                  !confirmEmail ||
                  updateEmailMutation.isPending
                }
              >
                {updateEmailMutation.isPending ? "Mise à jour…" : "Mettre à jour l'email"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ───── CARD : Mot de passe ───── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Mot de passe
          </CardTitle>
          <CardDescription>
            Choisissez un mot de passe d'au moins 6 caractères. Plus il est long, plus il est sûr.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1"
              />
              {newPassword.length > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${passwordStrength.color} transition-all`}
                      style={{ width: `${passwordStrength.pct}%` }}
                    />
                  </div>
                  <p className={`text-[11px] mt-1 font-medium ${
                    passwordStrength.color === "bg-rose-500"
                      ? "text-rose-600 dark:text-rose-400"
                      : passwordStrength.color === "bg-amber-500"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1"
              />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-[11px] mt-1 text-rose-600 dark:text-rose-400">
                  Les deux mots de passe ne correspondent pas.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  updatePasswordMutation.isPending
                }
              >
                {updatePasswordMutation.isPending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ───── CARD : Zone de danger ───── */}
      <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
            Zone de danger
          </CardTitle>
          <CardDescription className="text-rose-700/80 dark:text-rose-300/80">
            La suppression de votre compte est définitive. Vous perdrez l'accès à toutes vos données.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer mon compte
          </Button>
        </CardContent>
      </Card>

      {/* Dialog de confirmation — tape SUPPRIMER pour valider */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Supprimer définitivement votre compte ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">Action irréversible.</strong> Votre compte sera
              désactivé immédiatement et vous serez déconnecté. Vos données (devis, factures,
              clients) seront conservées 30 jours pour conformité légale puis supprimées.
              <br /><br />
              Pour confirmer, tapez <strong className="font-mono text-foreground">SUPPRIMER</strong> en majuscules :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="SUPPRIMER"
            className="font-mono"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "SUPPRIMER" || deleteAccountMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleteAccountMutation.isPending ? "Suppression…" : "Confirmer la suppression"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
