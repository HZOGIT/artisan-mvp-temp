import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil, Download, Mail, Trash2, ChevronDown, Truck, Building2, CalendarDays, MapPin, FileText, Package } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  confirmee: "Confirmée",
  partiellement_livree: "Partiellement livrée",
  livree: "Livrée",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  confirmee: "bg-orange-100 text-orange-700",
  partiellement_livree: "bg-amber-100 text-amber-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

const nextStatuses: Record<string, string[]> = {
  brouillon: ["envoyee", "annulee"],
  envoyee: ["confirmee", "annulee"],
  confirmee: ["livree", "annulee"],
  partiellement_livree: ["livree", "annulee"],
  livree: [],
  annulee: [],
};

function formatCurrency(value: any): string {
  const num = parseFloat(value) || 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
}

export default function CommandeFournisseurDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: commande, isLoading } = trpc.commandesFournisseurs.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const updateStatutMutation = trpc.commandesFournisseurs.updateStatut.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.getById.invalidate({ id: parseInt(id || "0") });
      utils.commandesFournisseurs.list.invalidate();
      toast.success("Statut mis à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour du statut"),
  });

  const deleteMutation = trpc.commandesFournisseurs.delete.useMutation({
    onSuccess: () => {
      toast.success("Commande supprimée");
      setLocation("/commandes");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const sendEmailMutation = trpc.commandesFournisseurs.sendEmail.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Bon de commande envoyé par email");
    },
    onError: (err) => toast.error(err.message || "Erreur lors de l'envoi"),
  });

  const handleChangeStatut = (statut: string) => {
    updateStatutMutation.mutate({ id: parseInt(id || "0"), statut });
  };

  // OPE-101 — suivi de facturation (facture fournisseur reçue/saisie ?).
  const setFacturationMutation = trpc.commandesFournisseurs.setStatutFacturation.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.getById.invalidate({ id: parseInt(id || "0") });
      utils.commandesFournisseurs.list.invalidate();
      toast.success("Suivi de facturation mis à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour du suivi de facturation"),
  });
  const handleToggleFacturation = (next: "a_facturer" | "facturee") => {
    setFacturationMutation.mutate({ id: parseInt(id || "0"), statutFacturation: next });
  };
  // OPE-101 — lier la facture fournisseur (dépense) à la commande : marque « facturée »
  // ET enregistre depenseId (réutilise setStatutFacturation). Liste des dépenses du tenant.
  const { data: depensesData } = trpc.depenses.list.useQuery({});
  const linkedDepenseId = (commande as any)?.depenseId ?? null;
  const linkedDepense = (depensesData as any[] | undefined)?.find((d) => d.id === linkedDepenseId);
  const handleLinkDepense = (depenseIdStr: string) => {
    const depId = parseInt(depenseIdStr);
    if (!depId) return;
    setFacturationMutation.mutate({ id: parseInt(id || "0"), statutFacturation: "facturee", depenseId: depId });
  };

  // OPE-100 — saisie de la réception (quantité reçue par ligne). État local indexé par ligneId.
  const [recue, setRecue] = useState<Record<number, string>>({});
  const recevoirMutation = trpc.commandesFournisseurs.recevoir.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.getById.invalidate({ id: parseInt(id || "0") });
      utils.commandesFournisseurs.list.invalidate();
      setRecue({});
      toast.success("Réception enregistrée");
    },
    onError: (err) => toast.error(err.message || "Erreur lors de l'enregistrement de la réception"),
  });

  const handleEnregistrerReception = (lignes: any[]) => {
    const payload = lignes
      .filter((l) => l.id != null)
      .map((l) => ({
        ligneId: l.id as number,
        // Valeur saisie si présente, sinon la quantité reçue déjà enregistrée (inchangée).
        quantiteRecue: recue[l.id] !== undefined
          ? (parseFloat(recue[l.id]) || 0)
          : (parseFloat(l.quantiteRecue) || 0),
      }));
    if (payload.length === 0) return;
    recevoirMutation.mutate({ id: parseInt(id || "0"), lignes: payload });
  };

  const handleDelete = () => {
    if (confirm("Supprimer cette commande ?")) {
      deleteMutation.mutate({ id: parseInt(id || "0") });
    }
  };

  const handleSendEmail = () => {
    if (confirm("Envoyer le bon de commande par email au fournisseur ?")) {
      sendEmailMutation.mutate({ id: parseInt(id || "0") });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!commande) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/commandes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux commandes
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Commande non trouvée</h3>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statut = commande.statut || "brouillon";
  const possibleNextStatuses = nextStatuses[statut] || [];
  const lignes = commande.lignes || [];
  const fournisseur = commande.fournisseur;
  // OPE-100 — la réception est éditable tant que la commande est en cours (ni brouillon,
  // ni clôturée/annulée).
  const receptionActive = ["envoyee", "confirmee", "partiellement_livree"].includes(statut);
  const aDesQuantitesRecues = lignes.some((l: any) => (parseFloat(l.quantiteRecue) || 0) > 0);
  // OPE-101 — suivi de facturation : pertinent dès qu'une commande est (partiellement) reçue.
  const statutFacturation = (commande as any).statutFacturation || "a_facturer";
  const estRecue = ["partiellement_livree", "livree"].includes(statut);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/commandes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{commande.numero || "Commande"}</h1>
            <Badge className={statusColors[statut] || "bg-gray-100"}>
              {statusLabels[statut] || statut}
            </Badge>
            {/* OPE-101 — badge de suivi de facturation (visible dès qu'une commande est reçue) */}
            {estRecue && (
              <Badge className={statutFacturation === "facturee" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                {statutFacturation === "facturee" ? "Facturée" : "À facturer"}
              </Badge>
            )}
            {/* OPE-101 — facture fournisseur (dépense) liée */}
            {statutFacturation === "facturee" && linkedDepense && (
              <span className="text-sm text-muted-foreground">
                · Facture : {linkedDepense.fournisseur || linkedDepense.description || `Dépense #${linkedDepense.id}`} ({formatCurrency(linkedDepense.montant_ttc)})
              </span>
            )}
          </div>
          {fournisseur && (
            <p className="text-muted-foreground">{fournisseur.nom}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation(`/commandes/${id}/modifier`)}>
            <Pencil className="h-4 w-4 mr-2" />
            Modifier
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/commandes-fournisseurs/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />
              PDF
            </a>
          </Button>
          <Button variant="outline" onClick={handleSendEmail} disabled={sendEmailMutation.isPending}>
            <Mail className="h-4 w-4 mr-2" />
            Envoyer
          </Button>
          {/* OPE-101 — bascule du suivi de facturation (commande reçue) */}
          {estRecue && (
            <Button
              variant="outline"
              onClick={() => handleToggleFacturation(statutFacturation === "facturee" ? "a_facturer" : "facturee")}
              disabled={setFacturationMutation.isPending}
            >
              {statutFacturation === "facturee" ? "Marquer à facturer" : "Marquer facturée"}
            </Button>
          )}
          {/* OPE-101 — lier la facture fournisseur (dépense) à la commande */}
          {estRecue && statutFacturation !== "facturee" && (depensesData?.length ?? 0) > 0 && (
            <Select value="" onValueChange={handleLinkDepense} disabled={setFacturationMutation.isPending}>
              <SelectTrigger className="w-[230px]">
                <SelectValue placeholder="Lier une facture fournisseur…" />
              </SelectTrigger>
              <SelectContent>
                {(depensesData as any[]).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {(d.fournisseur || d.description || `Dépense #${d.id}`)} — {formatCurrency(d.montant_ttc)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {possibleNextStatuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  Changer statut
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {possibleNextStatuses.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleChangeStatut(s)}>
                    <Badge className={`${statusColors[s]} mr-2`}>{statusLabels[s]}</Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Fournisseur</p>
                <p className="font-medium">{fournisseur?.nom || "—"}</p>
                {fournisseur?.email && <p className="text-sm text-muted-foreground">{fournisseur.email}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Date de commande</p>
                <p className="font-medium">
                  {commande.dateCommande ? format(new Date(commande.dateCommande), "dd/MM/yyyy") : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Délai de livraison</p>
                <p className="font-medium">{commande.delaiLivraison || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Référence</p>
                <p className="font-medium">{commande.reference || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Adresse livraison + Notes */}
      {(commande.adresseLivraison || commande.notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {commande.adresseLivraison && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Adresse de livraison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{commande.adresseLivraison}</p>
              </CardContent>
            </Card>
          )}
          {commande.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{commande.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Lignes */}
      <Card>
        <CardHeader>
          <CardTitle>Lignes de commande</CardTitle>
        </CardHeader>
        <CardContent>
          {lignes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th className="text-center whitespace-nowrap">Quantité</th>
                    {(receptionActive || aDesQuantitesRecues) && (
                      <th className="text-center whitespace-nowrap">Reçu</th>
                    )}
                    <th className="text-center">Unité</th>
                    <th className="text-right whitespace-nowrap">P.U. HT</th>
                    <th className="text-center">TVA</th>
                    <th className="text-right whitespace-nowrap">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne: any, idx: number) => {
                    const qty = parseFloat(ligne.quantite) || 0;
                    const pu = parseFloat(ligne.prixUnitaire) || 0;
                    const totalLigne = qty * pu;
                    const tva = parseFloat(ligne.tauxTVA) || 20;
                    return (
                      <tr key={ligne.id || idx}>
                        <td>
                          <div>
                            <span className="font-medium">{ligne.designation}</span>
                            {ligne.reference && (
                              <span className="text-muted-foreground text-sm ml-2">({ligne.reference})</span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">{qty}</td>
                        {(receptionActive || aDesQuantitesRecues) && (
                          <td className="text-center">
                            {receptionActive ? (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={recue[ligne.id] !== undefined ? recue[ligne.id] : String(parseFloat(ligne.quantiteRecue) || 0)}
                                onChange={(e) => setRecue((prev) => ({ ...prev, [ligne.id]: e.target.value }))}
                                className="w-20 px-2 py-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <span>{parseFloat(ligne.quantiteRecue) || 0}</span>
                            )}
                          </td>
                        )}
                        <td className="text-center">{ligne.unite || "unité"}</td>
                        <td className="text-right">{formatCurrency(pu)}</td>
                        <td className="text-center">{tva}%</td>
                        <td className="text-right font-medium">{formatCurrency(totalLigne)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Aucune ligne dans cette commande</p>
          )}
          {receptionActive && lignes.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <p className="text-sm text-muted-foreground">
                Saisissez la quantité reçue par ligne, puis enregistrez la réception.
              </p>
              <Button
                onClick={() => handleEnregistrerReception(lignes)}
                disabled={recevoirMutation.isPending}
              >
                <Package className="h-4 w-4 mr-2" />
                {recevoirMutation.isPending ? "Enregistrement..." : "Enregistrer la réception"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totaux */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total HT</span>
                <span className="font-medium">{formatCurrency(commande.totalHT || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">TVA</span>
                <span className="font-medium">{formatCurrency(commande.totalTVA || 0)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-base">
                <span className="font-semibold">Total TTC</span>
                <span className="font-bold text-lg">{formatCurrency(commande.totalTTC || commande.montantTotal || 0)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
