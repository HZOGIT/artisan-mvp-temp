import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTechniciens, useTechnicienDetail } from "../application/use-techniciens";
import {
  habilExpiry,
  habilitationBadge,
  toTechnicienStatut,
  type Habilitation,
  type LinkableUser,
  type Technicien,
  type TechnicienStatut,
} from "../domain/technicien";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Badge } from "@/modern/shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/modern/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modern/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modern/shared/ui/table";
import { Users, Plus, Pencil, Trash2, Phone, Mail, Wrench, Calendar, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// Page Techniciens du FRONT NEUF (`/v2/techniciens`) — clean-archi : présentation pure. Données &
// mutations via `useTechniciens`/`useTechnicienDetail` (couche application, seule à importer tRPC) ;
// le calcul du badge d'habilitation (échéance/expiration) vient du domaine (`../domain/technicien`,
// pur & testé). Parité visuelle stricte : JSX/Tailwind à l'identique. Libellés via i18n (`techniciens`).

interface TechnicienForm {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  specialite: string;
  couleur: string;
  coutHoraire: string;
  statut: TechnicienStatut;
  userId: number | null;
}

const initialForm: TechnicienForm = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  specialite: "",
  couleur: "#3b82f6",
  coutHoraire: "",
  statut: "actif",
  userId: null,
};

// Valeur (hex) = donnée ; le libellé est traduit via `labelKey`.
const couleurs = [
  { value: "#3b82f6", labelKey: "couleur_bleu" },
  { value: "#10b981", labelKey: "couleur_vert" },
  { value: "#f59e0b", labelKey: "couleur_orange" },
  { value: "#ef4444", labelKey: "couleur_rouge" },
  { value: "#8b5cf6", labelKey: "couleur_violet" },
  { value: "#ec4899", labelKey: "couleur_rose" },
  { value: "#06b6d4", labelKey: "couleur_cyan" },
  { value: "#84cc16", labelKey: "couleur_lime" },
];

export default function TechniciensPage() {
  const { t } = useTranslation("techniciens");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TechnicienForm>(initialForm);
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const [habilForm, setHabilForm] = useState({ type: "", numero: "", organisme: "", dateObtention: "", dateExpiration: "" });

  const { techniciens, linkableUsers, create: createMutation, update: updateMutation, remove: deleteMutation } =
    useTechniciens();
  const { stats, habilitations, addHabilitation: addHabilMutation, deleteHabilitation: deleteHabilMutation } =
    useTechnicienDetail(selectedTechnicien);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // `coutHoraire` vide -> undefined : l'input serveur est un decimal validé (rejette "").
    const payload = { ...form, coutHoraire: form.coutHoraire || undefined };
    const onSettled = {
      onSuccess: () => {
        toast.success(editingId ? t("toastUpdated") : t("toastCreated"));
        setIsDialogOpen(false);
        setEditingId(null);
        setForm(initialForm);
      },
      onError: (error: { message: string }) => toast.error(error.message),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload }, onSettled);
    } else {
      createMutation.mutate(payload, onSettled);
    }
  };

  const handleEdit = (technicien: Technicien) => {
    setEditingId(technicien.id);
    setForm({
      nom: technicien.nom,
      prenom: technicien.prenom || "",
      email: technicien.email || "",
      telephone: technicien.telephone || "",
      specialite: technicien.specialite || "",
      couleur: technicien.couleur || "#3b82f6",
      coutHoraire: technicien.coutHoraire != null ? String(technicien.coutHoraire) : "",
      statut: toTechnicienStatut(technicien.statut),
      userId: technicien.userId ?? null,
    });
    setIsDialogOpen(true);
  };

  const getStatutBadge = (statut: string | null) => {
    switch (statut) {
      case "actif":
        return <Badge className="bg-green-500">{t("statutActif")}</Badge>;
      case "inactif":
        return <Badge variant="secondary">{t("statutInactif")}</Badge>;
      case "conge":
        return <Badge className="bg-orange-500">{t("statutConge")}</Badge>;
      default:
        return <Badge variant="outline">{t("statutInconnu")}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            {t("teamTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("teamSubtitle")}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(initialForm);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("newTech")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? t("editTech") : t("newTech")}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nom">{t("nomLabel")}</Label>
                  <Input
                    id="nom"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prenom">{t("prenomLabel")}</Label>
                  <Input
                    id="prenom"
                    value={form.prenom}
                    onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telephone">{t("telephoneLabel")}</Label>
                  <Input
                    id="telephone"
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialite">{t("specialiteLabel")}</Label>
                <Input
                  id="specialite"
                  value={form.specialite}
                  onChange={(e) => setForm({ ...form, specialite: e.target.value })}
                  placeholder={t("specialitePlaceholder")}
                />
              </div>
              {/* Coût horaire chargé — base du coût main-d'œuvre des chantiers */}
              <div className="space-y-2">
                <Label htmlFor="coutHoraire">{t("coutHoraireLabel")}</Label>
                <Input
                  id="coutHoraire"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.coutHoraire}
                  onChange={(e) => setForm({ ...form, coutHoraire: e.target.value })}
                  placeholder={t("coutHorairePlaceholder")}
                />
              </div>
              {/* Lien vers le compte de connexion du salarié (optionnel) */}
              <div className="space-y-2">
                <Label>{t("userLinkLabel")}</Label>
                <Select
                  value={form.userId != null ? String(form.userId) : "none"}
                  onValueChange={(value) => setForm({ ...form, userId: value === "none" ? null : Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("noUserLinked")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("noUserLinked")}</SelectItem>
                    {linkableUsers.map((u: LinkableUser) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nom}{u.role ? ` — ${u.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t("userLinkHint")}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("couleurLabel")}</Label>
                  <Select
                    value={form.couleur}
                    onValueChange={(value) => setForm({ ...form, couleur: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {couleurs.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: c.value }}
                            />
                            {t(c.labelKey)}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("statutLabel")}</Label>
                  <Select
                    value={form.statut}
                    onValueChange={(value: "actif" | "inactif" | "conge") =>
                      setForm({ ...form, statut: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actif">{t("statutActif")}</SelectItem>
                      <SelectItem value="inactif">{t("statutInactif")}</SelectItem>
                      <SelectItem value="conge">{t("statutConge")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("cancel", { ns: "common" })}
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? t("update") : t("create")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des techniciens */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("teamCount", { n: techniciens.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {techniciens.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("emptyTeam")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("thTech")}</TableHead>
                    <TableHead>{t("thContact")}</TableHead>
                    <TableHead>{t("thSpecialite")}</TableHead>
                    <TableHead>{t("thStatut")}</TableHead>
                    <TableHead className="text-right">{t("thActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {techniciens.map((tech: Technicien) => (
                    <TableRow
                      key={tech.id}
                      className={`cursor-pointer ${selectedTechnicien === tech.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedTechnicien(tech.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tech.couleur || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">
                              {tech.prenom} {tech.nom}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {tech.email && (
                            <p className="text-sm flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {tech.email}
                            </p>
                          )}
                          {tech.telephone && (
                            <p className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {tech.telephone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tech.specialite && (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Wrench className="h-3 w-3" />
                            {tech.specialite}
                          </Badge>
                        )}
                        {tech.coutHoraire != null && tech.coutHoraire !== "" && (
                          <span className="text-xs text-muted-foreground block mt-1">
                            {t("costPerHour", { cost: Number(tech.coutHoraire).toFixed(2) })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatutBadge(tech.statut)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(tech);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t("confirmDeleteTech"))) {
                                deleteMutation.mutate(
                                  { id: tech.id },
                                  {
                                    onSuccess: () => toast.success(t("toastDeleted")),
                                    onError: (error) => toast.error(error.message),
                                  },
                                );
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Statistiques du technicien sélectionné */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("statsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTechnicien && stats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-muted-foreground">{t("statTotal")}</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{stats.terminees}</p>
                    <p className="text-sm text-muted-foreground">{t("statTerminees")}</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{stats.enCours}</p>
                    <p className="text-sm text-muted-foreground">{t("statEnCours")}</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{stats.planifiees}</p>
                    <p className="text-sm text-muted-foreground">{t("statPlanifiees")}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t("statsEmpty")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Habilitations / certifications du technicien sélectionné */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t("habilTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedTechnicien ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("habilEmptySelect")}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Liste */}
                {habilitations.length > 0 ? (
                  <div className="space-y-2">
                    {habilitations.map((h: Habilitation) => {
                      // Badge & échéance délégués au domaine (pur, testé).
                      const badge = habilitationBadge(h);
                      const badgeLabel =
                        badge.key === "habilExpiresIn" ? t("habilExpiresIn", { n: badge.params.n }) : t(badge.key);
                      const exp = habilExpiry(h);
                      return (
                        <div key={h.id} className="flex items-start justify-between gap-2 p-3 border rounded-lg">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{h.type}</span>
                              <Badge variant={badge.variant}>{badgeLabel}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {h.numero && <p>{t("habilNumero")} {h.numero}</p>}
                              {h.organisme && <p>{t("habilOrganisme")} {h.organisme}</p>}
                              {exp && <p>{t("habilEcheance")} {exp.toLocaleDateString("fr-FR")}</p>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (selectedTechnicien != null && confirm(t("confirmDeleteHabil"))) {
                                deleteHabilMutation.mutate(
                                  { technicienId: selectedTechnicien, id: h.id },
                                  {
                                    onSuccess: () => toast.success(t("toastHabilDeleted")),
                                    onError: (error) => toast.error(error.message),
                                  },
                                );
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("habilEmpty")}</p>
                )}

                {/* Formulaire d'ajout */}
                <form
                  className="space-y-2 border-t pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (selectedTechnicien == null) return;
                    if (!habilForm.type.trim()) {
                      toast.error(t("toastHabilTypeRequired"));
                      return;
                    }
                    addHabilMutation.mutate(
                      {
                        technicienId: selectedTechnicien,
                        type: habilForm.type.trim(),
                        numero: habilForm.numero.trim() || undefined,
                        organisme: habilForm.organisme.trim() || undefined,
                        dateObtention: habilForm.dateObtention || undefined,
                        dateExpiration: habilForm.dateExpiration || undefined,
                      },
                      {
                        onSuccess: () => {
                          toast.success(t("toastHabilAdded"));
                          setHabilForm({ type: "", numero: "", organisme: "", dateObtention: "", dateExpiration: "" });
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    );
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("habilTypeLabel")}</Label>
                      <Input
                        value={habilForm.type}
                        onChange={(e) => setHabilForm({ ...habilForm, type: e.target.value })}
                        placeholder={t("habilTypePlaceholder")}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("habilNumeroLabel")}</Label>
                      <Input
                        value={habilForm.numero}
                        onChange={(e) => setHabilForm({ ...habilForm, numero: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("habilOrganismeLabel")}</Label>
                      <Input
                        value={habilForm.organisme}
                        onChange={(e) => setHabilForm({ ...habilForm, organisme: e.target.value })}
                        placeholder={t("habilOrganismePlaceholder")}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("habilObtentionLabel")}</Label>
                      <Input
                        type="date"
                        value={habilForm.dateObtention}
                        onChange={(e) => setHabilForm({ ...habilForm, dateObtention: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("habilExpirationLabel")}</Label>
                      <Input
                        type="date"
                        value={habilForm.dateExpiration}
                        onChange={(e) => setHabilForm({ ...habilForm, dateExpiration: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" disabled={addHabilMutation.isPending}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("add")}
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
