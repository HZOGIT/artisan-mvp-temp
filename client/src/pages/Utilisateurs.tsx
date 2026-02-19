import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "sonner";
import { Users, UserPlus, Shield, Mail, Settings2, RotateCcw } from "lucide-react";
import { PERMISSION_GROUPS, ROLE_TEMPLATES } from "@shared/permissions";

const roleBadgeColor: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  artisan: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  secretaire: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  technicien: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const roleFr: Record<string, string> = {
  admin: "Administrateur",
  artisan: "Artisan",
  secretaire: "Secrétaire",
  technicien: "Technicien",
};

// Build dynamic permissions matrix from ROLE_TEMPLATES (static, outside component)
const roles = ["admin", "artisan", "secretaire", "technicien"] as const;
const matrixRows = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((p) => ({
    label: p.label,
    group: group.label,
    roles: roles.map((r) => (ROLE_TEMPLATES[r] || []).includes(p.code)),
  })),
);

export default function Utilisateurs() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", nom: "", prenom: "", role: "secretaire" });
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permUser, setPermUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [localPerms, setLocalPerms] = useState<string[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  // All hooks MUST be called before any conditional returns
  const { data: utilisateurs = [], refetch } = trpc.utilisateurs.list.useQuery();
  const inviteMutation = trpc.utilisateurs.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation envoyée !");
      setDialogOpen(false);
      setInviteForm({ email: "", nom: "", prenom: "", role: "secretaire" });
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const updateRoleMutation = trpc.utilisateurs.updateRole.useMutation({
    onSuccess: () => { toast.success("Rôle modifié"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });
  const toggleActifMutation = trpc.utilisateurs.toggleActif.useMutation({
    onSuccess: () => { toast.success("Statut modifié"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  // Permissions queries - always declared, enabled only when dialog is open
  const { data: permData, isLoading: permLoading } = trpc.utilisateurs.getPermissions.useQuery(
    { userId: permUser?.id ?? 0 },
    { enabled: permDialogOpen && !!permUser },
  );
  const updatePermsMutation = trpc.utilisateurs.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions sauvegardées");
      setPermDialogOpen(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const resetPermsMutation = trpc.utilisateurs.resetPermissions.useMutation({
    onSuccess: (result: any) => {
      toast.success("Permissions réinitialisées selon le rôle");
      setLocalPerms(result.permissions || []);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Sync permissions data when loaded
  useEffect(() => {
    if (permData && !permsLoaded) {
      setLocalPerms(permData.permissions || []);
      setPermsLoaded(true);
    }
  }, [permData, permsLoaded]);

  // Reset loaded state when dialog closes
  useEffect(() => {
    if (!permDialogOpen) {
      setPermsLoaded(false);
    }
  }, [permDialogOpen]);

  // Redirect non-admin users (AFTER all hooks)
  if (user && (user as any).role !== "admin") {
    setLocation("/dashboard");
    return null;
  }

  const handleInvite = () => {
    if (!inviteForm.email || !inviteForm.nom) {
      toast.error("Email et nom requis");
      return;
    }
    inviteMutation.mutate({
      email: inviteForm.email,
      nom: inviteForm.nom,
      prenom: inviteForm.prenom || undefined,
      role: inviteForm.role as "artisan" | "secretaire" | "technicien",
    });
  };

  const openPermissions = (u: any) => {
    const displayName = u.prenom ? `${u.prenom} ${u.name}` : u.name || u.email;
    setPermUser({ id: u.id, name: displayName, role: u.role });
    setPermsLoaded(false);
    setPermDialogOpen(true);
  };

  const togglePermission = (code: string) => {
    setLocalPerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  };

  const roleDefaults = ROLE_TEMPLATES[permUser?.role || ""] || [];
  const isCustomized = (code: string) => {
    return roleDefaults.includes(code as any) !== localPerms.includes(code);
  };
  const hasAnyCustomization = PERMISSION_GROUPS.some((g) =>
    g.permissions.some((p) => isCustomized(p.code)),
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Gestion des utilisateurs
          </h1>
          <p className="text-muted-foreground mt-1">
            Invitez des collaborateurs et gérez leurs accès
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Inviter un collaborateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un collaborateur</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="collaborateur@email.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nom *</Label>
                  <Input
                    placeholder="Dupont"
                    value={inviteForm.nom}
                    onChange={(e) => setInviteForm({ ...inviteForm, nom: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Prénom</Label>
                  <Input
                    placeholder="Marie"
                    value={inviteForm.prenom}
                    onChange={(e) => setInviteForm({ ...inviteForm, prenom: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Rôle</Label>
                <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="artisan">Artisan</SelectItem>
                    <SelectItem value="secretaire">Secrétaire</SelectItem>
                    <SelectItem value="technicien">Technicien</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {inviteForm.role === "secretaire" && "Accès : devis, factures, clients, chat, relances"}
                  {inviteForm.role === "technicien" && "Accès : interventions, calendrier, chantiers, géolocalisation"}
                  {inviteForm.role === "artisan" && "Accès complet sauf gestion des utilisateurs"}
                </p>
              </div>
              <Button onClick={handleInvite} className="w-full" disabled={inviteMutation.isPending}>
                <Mail className="h-4 w-4 mr-2" />
                {inviteMutation.isPending ? "Envoi..." : "Envoyer l'invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Équipe ({utilisateurs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Dernier accès</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utilisateurs.map((u: any) => {
                const isCurrentUser = u.id === (user as any)?.id;
                const isAdmin = u.role === "admin";
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.prenom ? `${u.prenom} ${u.name}` : u.name || "—"}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {isAdmin || isCurrentUser ? (
                        <Badge className={roleBadgeColor[u.role] || ""} variant="secondary">
                          {roleFr[u.role] || u.role}
                        </Badge>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(v) => updateRoleMutation.mutate({ userId: u.id, role: v as any })}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <Badge className={roleBadgeColor[u.role] || ""} variant="secondary">
                              {roleFr[u.role] || u.role}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="artisan">Artisan</SelectItem>
                            <SelectItem value="secretaire">Secrétaire</SelectItem>
                            <SelectItem value="technicien">Technicien</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin || isCurrentUser ? (
                        <Badge variant="outline" className="text-green-600">Actif</Badge>
                      ) : (
                        <Switch
                          checked={u.actif}
                          onCheckedChange={(v) => toggleActifMutation.mutate({ userId: u.id, actif: v })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "short", year: "numeric",
                      }) : "—"}
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span className="text-xs text-muted-foreground">Propriétaire</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPermissions(u)}
                          className="gap-1.5"
                        >
                          <Settings2 className="h-4 w-4" />
                          Permissions
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {utilisateurs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Aucun utilisateur trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Permissions reference matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions par rôle (défauts)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">Permission</th>
                  {roles.map((r) => (
                    <th key={r} className="py-2 px-3">
                      <Badge className={roleBadgeColor[r] || ""} variant="secondary">
                        {roleFr[r]}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{row.label}</td>
                    {row.roles.map((has, j) => (
                      <td key={j} className="py-2 px-3 text-center">
                        {has ? (
                          <span className="text-green-600 font-bold">&#10003;</span>
                        ) : (
                          <span className="text-red-400">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Permissions management dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Gérer les permissions — {permUser?.name}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              {permUser && (
                <Badge className={roleBadgeColor[permUser.role] || ""} variant="secondary">
                  {roleFr[permUser.role] || permUser.role}
                </Badge>
              )}
              {hasAnyCustomization && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  personnalisé
                </Badge>
              )}
            </div>
          </DialogHeader>

          {permLoading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement des permissions...</div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2">
                <div className="space-y-5 py-2">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {group.label}
                      </h4>
                      <div className="space-y-1">
                        {group.permissions.map((perm) => {
                          const checked = localPerms.includes(perm.code);
                          const custom = isCustomized(perm.code);
                          return (
                            <label
                              key={perm.code}
                              className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePermission(perm.code)}
                              />
                              <span className="text-sm flex-1">{perm.label}</span>
                              {custom && (
                                <Badge
                                  variant="outline"
                                  className="text-orange-600 border-orange-300 text-[10px] px-1.5 py-0"
                                >
                                  personnalisé
                                </Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-shrink-0 flex items-center gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => permUser && resetPermsMutation.mutate({ userId: permUser.id })}
                  disabled={resetPermsMutation.isPending || !permUser}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Réinitialiser selon le rôle
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPermDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={() => permUser && updatePermsMutation.mutate({ userId: permUser.id, permissions: localPerms })}
                  disabled={updatePermsMutation.isPending || !permUser}
                >
                  {updatePermsMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
