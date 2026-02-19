import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Users, UserPlus, Shield, Mail } from "lucide-react";

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

export default function Utilisateurs() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", nom: "", prenom: "", role: "secretaire" });

  // Redirect non-admin users
  if (user && (user as any).role !== "admin") {
    setLocation("/dashboard");
    return null;
  }

  const { data: utilisateurs = [], refetch } = trpc.utilisateurs.list.useQuery();
  const inviteMutation = trpc.utilisateurs.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation envoyée !");
      setDialogOpen(false);
      setInviteForm({ email: "", nom: "", prenom: "", role: "secretaire" });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateRoleMutation = trpc.utilisateurs.updateRole.useMutation({
    onSuccess: () => { toast.success("Rôle modifié"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const toggleActifMutation = trpc.utilisateurs.toggleActif.useMutation({
    onSuccess: () => { toast.success("Statut modifié"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

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
                      {isAdmin && <span className="text-xs text-muted-foreground">Propriétaire</span>}
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

      <Card>
        <CardHeader>
          <CardTitle>Permissions par rôle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">Fonctionnalité</th>
                  <th className="py-2 px-3">Admin</th>
                  <th className="py-2 px-3">Artisan</th>
                  <th className="py-2 px-3">Secrétaire</th>
                  <th className="py-2 px-3">Technicien</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Dashboard / Stats", true, true, true, true],
                  ["MonAssistant", true, true, true, true],
                  ["Devis / Factures", true, true, true, false],
                  ["Clients / Chat", true, true, true, false],
                  ["Interventions / Calendrier", true, true, false, true],
                  ["Chantiers", true, true, false, true],
                  ["Comptabilité / Exports", true, true, false, false],
                  ["Paramètres", true, true, false, false],
                  ["Gestion utilisateurs", true, false, false, false],
                ].map(([label, ...perms], i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{label as string}</td>
                    {(perms as boolean[]).map((p, j) => (
                      <td key={j} className="py-2 px-3 text-center">
                        {p ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-400">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
