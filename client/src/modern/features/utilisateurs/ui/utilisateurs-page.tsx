import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Users, UserPlus, Shield, Mail, Settings2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Badge } from "@/modern/shared/ui/badge";
import { Switch } from "@/modern/shared/ui/switch";
import { Checkbox } from "@/modern/shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { useUtilisateurs, useUtilisateurPermissions } from "../application/use-utilisateurs";
import {
  buildMatrixRows, roleDefaults, togglePermission, isCustomized, hasAnyCustomization, fullName,
  PERMISSION_GROUPS, ROLES, INVITABLE_ROLES, type Utilisateur, type InvitableRole,
} from "../domain/utilisateur";

const roleBadgeColor: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  artisan: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  secretaire: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  technicien: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const matrixRows = buildMatrixRows();

export default function UtilisateursPage() {
  const { t } = useTranslation("utilisateurs");
  const { utilisateurs, currentUser, invite, updateRole, toggleActif } = useUtilisateurs();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ email: string; nom: string; prenom: string; role: InvitableRole }>(
    { email: "", nom: "", prenom: "", role: "secretaire" },
  );
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permUser, setPermUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [localPerms, setLocalPerms] = useState<string[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const { permData, isLoading: permLoading, updatePermissions, resetPermissions } = useUtilisateurPermissions(
    permUser?.id ?? 0,
    permDialogOpen && !!permUser,
  );

  useEffect(() => {
    if (permData && !permsLoaded) {
      setLocalPerms(permData.permissions ?? []);
      setPermsLoaded(true);
    }
  }, [permData, permsLoaded]);

  useEffect(() => {
    if (!permDialogOpen) setPermsLoaded(false);
  }, [permDialogOpen]);

  // Garde admin : redirige les non-admins vers le dashboard legacy (page non migrée).
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") window.location.assign("/dashboard");
  }, [currentUser]);

  const roleLabel = (r: string) => t(`role.${r}`, r);
  const t_roleBadge = (r: string) => (
    <Badge className={roleBadgeColor[r] || ""} variant="secondary">{roleLabel(r)}</Badge>
  );

  const handleInvite = () => {
    if (!inviteForm.email || !inviteForm.nom) {
      toast.error(t("inviteEmailNomRequis"));
      return;
    }
    invite.mutate(
      { email: inviteForm.email, nom: inviteForm.nom, prenom: inviteForm.prenom || undefined, role: inviteForm.role },
      {
        onSuccess: () => { toast.success(t("toastInvitation")); setDialogOpen(false); setInviteForm({ email: "", nom: "", prenom: "", role: "secretaire" }); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const openPermissions = (u: Utilisateur) => {
    const displayName = fullName(u) || u.email || "";
    setPermUser({ id: u.id, name: displayName, role: u.role });
    setPermsLoaded(false);
    setPermDialogOpen(true);
  };

  const defaults = useMemo(() => roleDefaults(permUser?.role ?? ""), [permUser]);
  const hasCustomization = hasAnyCustomization(defaults, localPerms);

  if (currentUser && currentUser.role !== "admin") return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("inviter")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("inviter")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t("inviteEmail")}</Label>
                <Input type="email" placeholder={t("inviteEmailPlaceholder")} value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("inviteNom")}</Label>
                  <Input placeholder={t("inviteNomPlaceholder")} value={inviteForm.nom} onChange={(e) => setInviteForm({ ...inviteForm, nom: e.target.value })} />
                </div>
                <div>
                  <Label>{t("invitePrenom")}</Label>
                  <Input placeholder={t("invitePrenomPlaceholder")} value={inviteForm.prenom} onChange={(e) => setInviteForm({ ...inviteForm, prenom: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t("inviteRole")}</Label>
                <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as InvitableRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {inviteForm.role === "secretaire" && t("accesSecretaire")}
                  {inviteForm.role === "technicien" && t("accesTechnicien")}
                  {inviteForm.role === "artisan" && t("accesArtisan")}
                </p>
              </div>
              <Button onClick={handleInvite} className="w-full" disabled={invite.isPending}>
                <Mail className="h-4 w-4 mr-2" />
                {invite.isPending ? t("inviteEnvoi") : t("inviteEnvoyer")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("equipe", { count: utilisateurs.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colNom")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colActif")}</TableHead>
                <TableHead>{t("colDernierAcces")}</TableHead>
                <TableHead>{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utilisateurs.map((u) => {
                const isCurrentUser = u.id === currentUser?.id;
                const isAdmin = u.role === "admin";
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{fullName(u) || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {isAdmin || isCurrentUser ? (
                        t_roleBadge(u.role)
                      ) : (
                        <Select value={u.role} onValueChange={(v) => updateRole.mutate({ userId: u.id, role: v as InvitableRole }, { onSuccess: () => toast.success(t("toastRoleModifie")), onError: (e) => toast.error(e.message) })}>
                          <SelectTrigger className="w-32 h-8">{t_roleBadge(u.role)}</SelectTrigger>
                          <SelectContent>
                            {INVITABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin || isCurrentUser ? (
                        <Badge variant="outline" className="text-green-600">{t("actif")}</Badge>
                      ) : (
                        <Switch checked={u.actif} onCheckedChange={(v) => toggleActif.mutate({ userId: u.id, actif: v }, { onSuccess: () => toast.success(t("toastStatutModifie")), onError: (e) => toast.error(e.message) })} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span className="text-xs text-muted-foreground">{t("proprietaire")}</span>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => openPermissions(u)} className="gap-1.5">
                          <Settings2 className="h-4 w-4" />
                          {t("permissions")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {utilisateurs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("aucunUtilisateur")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("matriceTitre")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">{t("matricePermission")}</th>
                  {ROLES.map((r) => (
                    <th key={r} className="py-2 px-3">{t_roleBadge(r)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{row.label}</td>
                    {row.roles.map((has, j) => (
                      <td key={j} className="py-2 px-3 text-center">
                        {has ? <span className="text-green-600 font-bold">&#10003;</span> : <span className="text-red-400">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-lg p-0" style={{ display: "flex", flexDirection: "column", maxHeight: "80vh", overflow: "hidden" }}>
          <div className="p-6 pb-3" style={{ flexShrink: 0 }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {t("permsDialogTitre", { name: permUser?.name ?? "" })}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                {permUser && t_roleBadge(permUser.role)}
                {hasCustomization && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">{t("personnalise")}</Badge>
                )}
              </div>
            </DialogHeader>
          </div>

          {permLoading ? (
            <div className="py-8 text-center text-muted-foreground">{t("permsChargement")}</div>
          ) : (
            <>
              <div className="px-6" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div className="space-y-5 py-1">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.label}</h4>
                      <div className="space-y-1">
                        {group.permissions.map((perm) => {
                          const checked = localPerms.includes(perm.code);
                          const custom = isCustomized(defaults, localPerms, perm.code);
                          return (
                            <label key={perm.code} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer">
                              <Checkbox checked={checked} onCheckedChange={() => setLocalPerms((prev) => togglePermission(prev, perm.code))} />
                              <span className="text-sm flex-1">{perm.label}</span>
                              {custom && (
                                <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px] px-1.5 py-0">{t("personnalise")}</Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 pt-4 border-t" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => permUser && resetPermissions.mutate({ userId: permUser.id }, {
                      onSuccess: (result) => { toast.success(t("toastPermsReinit")); setLocalPerms(result.permissions ?? []); },
                      onError: (e) => toast.error(e.message),
                    })}
                    disabled={resetPermissions.isPending || !permUser}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t("reinitialiser")}
                  </Button>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setPermDialogOpen(false)}>{t("annuler")}</Button>
                  <Button
                    size="sm"
                    onClick={() => permUser && updatePermissions.mutate({ userId: permUser.id, permissions: localPerms }, {
                      onSuccess: () => { toast.success(t("toastPermsSauvegardees")); setPermDialogOpen(false); },
                      onError: (e) => toast.error(e.message),
                    })}
                    disabled={updatePermissions.isPending || !permUser}
                  >
                    {updatePermissions.isPending ? t("sauvegarde") : t("sauvegarder")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
