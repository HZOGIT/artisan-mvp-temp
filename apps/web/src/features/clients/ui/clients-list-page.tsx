import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation, useSearch } from "@/shared/router/navigation";
import { useTranslation } from "react-i18next";
import { useClients } from "../application/use-clients";
import { findDuplicateGroups, findCreateDuplicateMatch, pickSurvivor, type Client } from "../domain/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Plus, Search, Phone, Mail, MapPin, MoreHorizontal, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { toast } from "sonner";
import { matchSearch } from "@/shared/lib/normalize";
import { exportToCsv, csvDateSuffix } from "@/shared/lib/csv-export";

/*
 * Page Clients du FRONT NEUF (`/clients`) — clean-archi : la couche UI (présentation) consomme le
 * hook `useClients()` (couche application, seule à parler à tRPC) et les fonctions PURES du domaine
 * (`findDuplicateGroups`/`findCreateDuplicateMatch`). Aucun import tRPC ici. i18n namespace `clients`,
 * primitives `@/shared/ui`. Parité visuelle stricte vs `pages/Clients.tsx`.
 */

interface ClientFormData {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  adresseFacturation: string;
  codePostalFacturation: string;
  villeFacturation: string;
  type: "particulier" | "professionnel";
  raisonSociale: string;
  siret: string;
  numeroTVA: string;
  notes: string;
  etiquettes: string;
}

const initialFormData: ClientFormData = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  codePostal: "",
  ville: "",
  adresseFacturation: "",
  codePostalFacturation: "",
  villeFacturation: "",
  type: "particulier",
  raisonSociale: "",
  siret: "",
  numeroTVA: "",
  notes: "",
  etiquettes: "",
};

export default function ClientsListPage() {
  const { t } = useTranslation("clients");
  const [, navigate] = useLocation();
  const search = useSearch();
  const { clients, encoursMap, isLoading, update, remove, fusionner } = useClients();

  /** State pour le formulaire d'édition */
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);

  /** State pour la recherche. MonAssistant peut pré-remplir via ?filtre= */
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const f = new URLSearchParams(search).get("filtre");
    /*
     * Sur Clients il n'y a pas de filtre statut prédéfini : on utilise le filtre
     * comme texte de recherche (ex: "particulier") si fourni.
     */
    if (f) setSearchQuery(f);
  }, [search]);

  /** Doublons potentiels (logique PURE du domaine) — descripteurs i18n formatés au rendu via `t()`. */
  const [dupesDismissed, setDupesDismissed] = useState(false);
  const duplicateGroups = useMemo(() => findDuplicateGroups(clients), [clients]);

  /** Avertissement NON BLOQUANT de doublon à la création (logique PURE du domaine). */
  const createDuplicateMatch = useMemo(
    () => (editingClientId ? null : findCreateDuplicateMatch(formData, clients)),
    [editingClientId, formData.email, formData.telephone, formData.nom, formData.prenom, clients],
  );

  /** Handler pour les changements d'input */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  /** Handler pour réinitialiser le formulaire */
  const resetForm = useCallback(() => {
    setFormData(initialFormData);
  }, []);

  /** Handler pour fermer la modale d'édition */
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    resetForm();
    setEditingClientId(null);
  }, [resetForm]);

  /** Handler pour ouvrir la modale d'édition */
  const handleOpenEditModal = useCallback((client: Client) => {
    setFormData({
      nom: client.nom,
      prenom: client.prenom || "",
      email: client.email || "",
      telephone: client.telephone || "",
      adresse: client.adresse || "",
      codePostal: client.codePostal || "",
      ville: client.ville || "",
      adresseFacturation: client.adresseFacturation || "",
      codePostalFacturation: client.codePostalFacturation || "",
      villeFacturation: client.villeFacturation || "",
      type: (client.type === "professionnel" ? "professionnel" : "particulier"),
      raisonSociale: client.raisonSociale || "",
      siret: client.siret || "",
      numeroTVA: client.numeroTVA || "",
      notes: client.notes || "",
      etiquettes: client.etiquettes || "",
    });
    setEditingClientId(client.id);
    setIsEditModalOpen(true);
  }, []);

  /** Handler pour soumettre le formulaire d'édition */
  const handleSubmitEdit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      toast.error(t("toastNameRequired"));
      return;
    }
    if (editingClientId) {
      update.mutate(
        { id: editingClientId, ...formData },
        {
          onSuccess: () => {
            toast.success(t("toastUpdated"));
            setFormData(initialFormData);
            setEditingClientId(null);
            setIsEditModalOpen(false);
          },
          onError: (error) => toast.error(error.message || t("toastUpdateError")),
        },
      );
    }
  }, [formData, editingClientId, update, t]);

  /** Handler pour supprimer un client */
  const handleDelete = useCallback((clientId: number) => {
    if (confirm(t("confirmDelete"))) {
      remove.mutate(
        { id: clientId },
        {
          onSuccess: () => toast.success(t("toastDeleted")),
          onError: (error) => toast.error(error.message || t("toastDeleteError")),
        },
      );
    }
  }, [remove, t]);

  /** Handler pour la recherche */
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  /*
   * Fusionne un groupe de doublons : le survivant (profil le plus complet) absorbe l'historique de
   * chaque autre client du groupe (transaction côté serveur), qui est ensuite archivé. Non destructif.
   */
  const handleMergeGroup = useCallback((group: Client[]) => {
    const survivant = pickSurvivor(group);
    const doublons = group.filter((c) => c.id !== survivant.id);
    const label = `${(survivant.prenom || "")} ${survivant.nom}`.trim();
    if (!confirm(t("dupesMergeConfirm", { count: doublons.length, survivant: label }))) return;
    void Promise.all(
      doublons.map((d) => fusionner.mutateAsync({ survivantId: survivant.id, doublonId: d.id })),
    )
      .then(() => toast.success(t("dupesMergeSuccess", { survivant: label })))
      .catch((error: { message?: string }) => toast.error(error.message || t("dupesMergeError")));
  }, [fusionner, t]);

  /** Filtrer les clients (recherche insensible aux accents et a la casse). */
  const filteredClients = clients.filter(client =>
    matchSearch(client.nom, searchQuery) ||
    matchSearch(client.prenom, searchQuery) ||
    matchSearch(client.email, searchQuery) ||
    matchSearch(client.ville, searchQuery) ||
    /** Recherche/segmentation par étiquette. */
    matchSearch(client.etiquettes, searchQuery) ||
    (client.telephone ? client.telephone.includes(searchQuery) : false)
  );

  /*
   * Export CSV des clients (portabilité RGPD). Exporte la sélection courante (après filtre de
   * recherche), sinon l'ensemble.
   */
  const handleExportCSV = () => {
    const data = filteredClients;
    if (!data || data.length === 0) {
      toast.error(t("toastNothingToExport"));
      return;
    }
    const headers = [
      t("csvNom"), t("csvPrenom"), t("csvType"), t("csvRaisonSociale"), t("csvEmail"), t("csvTelephone"),
      t("csvAdresse"), t("csvCodePostal"), t("csvVille"), t("csvSiret"), t("csvNumeroTVA"), t("csvEtiquettes"), t("csvNotes"),
    ];
    const rows = data.map((c) => [
      c.nom, c.prenom, c.type, c.raisonSociale, c.email, c.telephone, c.adresse, c.codePostal, c.ville, c.siret, c.numeroTVA, c.etiquettes, c.notes,
    ]);
    exportToCsv(`clients_${csvDateSuffix()}.csv`, headers, rows);
    toast.success(t("toastExported", { count: data.length }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t("exportCsv")}
          </Button>
          <Button onClick={() => navigate('/clients/nouveau')}>
            <Plus className="h-4 w-4 mr-2" />
            {t("newClient")}
          </Button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Bandeau doublons potentiels (informatif, dismissable) */}
      {!isLoading && !dupesDismissed && duplicateGroups.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-800">
                    {t("dupes", { count: duplicateGroups.length })}
                  </p>
                  <ul className="mt-1 space-y-1 text-amber-700">
                    {duplicateGroups.slice(0, 5).map((g, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="text-amber-600">{t(g.reasonKey, g.reasonParams)}</span>{" : "}
                          {g.clients
                            .map((c) => `${(c.prenom || "")} ${c.nom}`.trim() + (c.ville ? ` (${c.ville})` : ""))
                            .join(" · ")}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                          disabled={fusionner.isPending}
                          onClick={() => handleMergeGroup(g.clients)}
                        >
                          {t("dupesMergeAction")}
                        </Button>
                      </li>
                    ))}
                    {duplicateGroups.length > 5 && (
                      <li className="text-amber-600">{t("dupesMore", { count: duplicateGroups.length - 5 })}</li>
                    )}
                  </ul>
                  <p className="mt-1 text-xs text-amber-600">{t("dupesHint")}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900" onClick={() => setDupesDismissed(true)}>
                {t("hide")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste des clients */}
      {isLoading ? (
        <div className="text-center py-8">{t("loading")}</div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery ? t("emptyFiltered") : t("emptyNone")}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map(client => (
            <Card key={client.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="font-semibold text-lg">{client.nom} {client.prenom}</h3>
                      {/* Badge « à risque » : impayés en cours */}
                      {encoursMap[client.id] && parseFloat(encoursMap[client.id].encoursTotal) > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                          title={t("unpaidTitle", { echu: encoursMap[client.id].echu, count: encoursMap[client.id].nbFacturesImpayees })}
                        >
                          {t("unpaidBadge", { amount: encoursMap[client.id].encoursTotal })}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600 mt-2">
                      {client.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {client.email}
                        </div>
                      )}
                      {client.telephone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {client.telephone}
                        </div>
                      )}
                      {client.adresse && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {client.adresse}, {client.codePostal} {client.ville}
                        </div>
                      )}
                    </div>
                    {/* Étiquettes de segmentation */}
                    {client.etiquettes && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {String(client.etiquettes).split(",").map((t2: string) => t2.trim()).filter(Boolean).map((tag: string, i: number) => (
                          <span key={i} className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEditModal(client)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(client.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Édition Client */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 z-40 bg-black/50" onClick={handleCloseEditModal} />
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{t("editTitle")}</h2>
              <button onClick={handleCloseEditModal} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmitEdit} className="space-y-4">
                {/* Type de client */}
                <div>
                  <Label htmlFor="edit-type" className="block text-sm font-medium mb-1">
                    {t("typeLabel")}
                  </Label>
                  <select
                    id="edit-type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="particulier">{t("typeParticulier")}</option>
                    <option value="professionnel">{t("typeProfessionnel")}</option>
                  </select>
                </div>

                {/* Nom */}
                <div>
                  <Label htmlFor="edit-nom" className="block text-sm font-medium mb-1">
                    {t("nomLabel")}
                  </Label>
                  <input
                    id="edit-nom"
                    type="text"
                    name="nom"
                    value={formData.nom}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Prénom */}
                <div>
                  <Label htmlFor="edit-prenom" className="block text-sm font-medium mb-1">
                    {t("prenomLabel")}
                  </Label>
                  <input
                    id="edit-prenom"
                    type="text"
                    name="prenom"
                    value={formData.prenom}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <Label htmlFor="edit-email" className="block text-sm font-medium mb-1">
                    {t("emailLabel")}
                  </Label>
                  <input
                    id="edit-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Téléphone */}
                <div>
                  <Label htmlFor="edit-telephone" className="block text-sm font-medium mb-1">
                    {t("telephoneLabel")}
                  </Label>
                  <input
                    id="edit-telephone"
                    type="tel"
                    name="telephone"
                    value={formData.telephone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Avertissement doublon (non bloquant) à la création */}
                {createDuplicateMatch && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
                    {t("dupeWarnPrefix", { reason: t(createDuplicateMatch.reasonKey) })}{" "}
                    <strong>
                      {createDuplicateMatch.client.prenom} {createDuplicateMatch.client.nom}
                    </strong>
                    {t("dupeWarnSuffix")}
                  </div>
                )}

                {/* Adresse */}
                <div>
                  <Label htmlFor="edit-adresse" className="block text-sm font-medium mb-1">
                    {t("adresseLabel")}
                  </Label>
                  <input
                    id="edit-adresse"
                    type="text"
                    name="adresse"
                    value={formData.adresse}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Code Postal et Ville */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-codePostal" className="block text-sm font-medium mb-1">
                      {t("codePostalLabel")}
                    </Label>
                    <input
                      id="edit-codePostal"
                      type="text"
                      name="codePostal"
                      value={formData.codePostal}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-ville" className="block text-sm font-medium mb-1">
                      {t("villeLabel")}
                    </Label>
                    <input
                      id="edit-ville"
                      type="text"
                      name="ville"
                      value={formData.ville}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Adresse de facturation distincte */}
                <div className="space-y-3 rounded-md border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">
                    {t("billingSectionTitle")} <span className="font-normal text-muted-foreground">{t("billingSectionHint")}</span>
                  </p>
                  <div>
                    <Label htmlFor="edit-adresseFacturation" className="block text-sm font-medium mb-1">
                      {t("adresseFacturationLabel")}
                    </Label>
                    <input
                      id="edit-adresseFacturation"
                      type="text"
                      name="adresseFacturation"
                      value={formData.adresseFacturation}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-codePostalFacturation" className="block text-sm font-medium mb-1">
                        {t("cpFacturationLabel")}
                      </Label>
                      <input
                        id="edit-codePostalFacturation"
                        type="text"
                        name="codePostalFacturation"
                        value={formData.codePostalFacturation}
                        onChange={handleInputChange}
                        maxLength={5}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-villeFacturation" className="block text-sm font-medium mb-1">
                        {t("villeFacturationLabel")}
                      </Label>
                      <input
                        id="edit-villeFacturation"
                        type="text"
                        name="villeFacturation"
                        value={formData.villeFacturation}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Champs professionnels */}
                {formData.type === "professionnel" && (
                  <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-700">{t("proSectionTitle")}</p>
                    <div>
                      <Label htmlFor="edit-raisonSociale" className="block text-sm font-medium mb-1">
                        {t("raisonSocialeLabel")}
                      </Label>
                      <input
                        id="edit-raisonSociale"
                        type="text"
                        name="raisonSociale"
                        value={formData.raisonSociale}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="edit-siret" className="block text-sm font-medium mb-1">
                          {t("siretLabel")}
                        </Label>
                        <input
                          id="edit-siret"
                          type="text"
                          name="siret"
                          value={formData.siret}
                          onChange={handleInputChange}
                          maxLength={14}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-numeroTVA" className="block text-sm font-medium mb-1">
                          {t("numeroTVALabel")}
                        </Label>
                        <input
                          id="edit-numeroTVA"
                          type="text"
                          name="numeroTVA"
                          value={formData.numeroTVA}
                          onChange={handleInputChange}
                          maxLength={20}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Étiquettes */}
                <div>
                  <Label htmlFor="edit-etiquettes" className="block text-sm font-medium mb-1">
                    {t("etiquettesLabel")}
                  </Label>
                  <input
                    id="edit-etiquettes"
                    name="etiquettes"
                    type="text"
                    value={formData.etiquettes}
                    onChange={handleInputChange}
                    placeholder={t("etiquettesPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="edit-notes" className="block text-sm font-medium mb-1">
                    {t("notesLabel")}
                  </Label>
                  <textarea
                    id="edit-notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Boutons */}
                <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {t("cancel", { ns: "common" })}
                  </button>
                  <button
                    type="submit"
                    disabled={update.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400"
                  >
                    {update.isPending ? t("submitting") : t("submit")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
