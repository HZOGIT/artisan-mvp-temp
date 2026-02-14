import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, Mail, Clock, FileText, User, Send, RefreshCw, AlertCircle, CheckCircle, History, Settings, Power, Calendar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link } from "wouter";

interface DevisNonSigne {
  devis: {
    id: number;
    numero: string;
    dateDevis: Date;
    totalTTC: string | null;
    statut: string | null;
  };
  client: {
    id: number;
    nom: string;
    email: string | null;
  } | null;
  signature: {
    id: number;
    token: string;
    createdAt: Date;
  } | null;
  joursDepuisCreation: number;
  joursDepuisEnvoi: number | null;
}

export default function RelancesDevis() {
  const [joursMinimum, setJoursMinimum] = useState(7);
  const [selectedDevis, setSelectedDevis] = useState<DevisNonSigne | null>(null);
  const [messageRelance, setMessageRelance] = useState("");
  const [showRelanceDialog, setShowRelanceDialog] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [joursEntreRelances, setJoursEntreRelances] = useState(7);
  const [configRelance, setConfigRelance] = useState({
    actif: false,
    joursApresEnvoi: 7,
    joursEntreRelances: 7,
    nombreMaxRelances: 3,
    heureEnvoi: "09:00",
    joursEnvoi: "1,2,3,4,5"
  });

  const utils = trpc.useUtils();
  
  const { data: devisNonSignes, isLoading } = trpc.devis.getDevisNonSignes.useQuery(
    { joursMinimum },
    { refetchOnWindowFocus: false }
  );

  const envoyerRelanceMutation = trpc.devis.envoyerRelance.useMutation({
    onSuccess: () => {
      toast.success("Relance envoyée avec succès");
      setShowRelanceDialog(false);
      setSelectedDevis(null);
      setMessageRelance("");
      utils.devis.getDevisNonSignes.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const envoyerRelancesAutoMutation = trpc.devis.envoyerRelancesAutomatiques.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.relancesEnvoyees} relance(s) envoyée(s) automatiquement`);
      setShowAutoDialog(false);
      utils.devis.getDevisNonSignes.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const formatCurrency = (value: string | number | null) => {
    if (value === null) return "0,00 €";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const handleRelance = (devis: DevisNonSigne) => {
    setSelectedDevis(devis);
    setMessageRelance(`Bonjour,

Nous vous rappelons que le devis n°${devis.devis.numero} d'un montant de ${formatCurrency(devis.devis.totalTTC)} est toujours en attente de votre signature.

N'hésitez pas à nous contacter pour toute question.

Cordialement`);
    setShowRelanceDialog(true);
  };

  const confirmRelance = () => {
    if (!selectedDevis) return;
    envoyerRelanceMutation.mutate({
      devisId: selectedDevis.devis.id,
      message: messageRelance
    });
  };

  const handleRelancesAuto = () => {
    envoyerRelancesAutoMutation.mutate({
      joursMinimum,
      joursEntreRelances
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const devisAvecEmail = devisNonSignes?.filter(d => d.client?.email) || [];
  const devisSansEmail = devisNonSignes?.filter(d => !d.client?.email) || [];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relances Devis</h1>
          <p className="text-muted-foreground">
            Gérez les relances pour les devis en attente de signature
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Configuration auto
          </Button>
          <Button variant="outline" onClick={() => setShowAutoDialog(true)} disabled={devisAvecEmail.length === 0}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Relances manuelles
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="joursMinimum">Devis de plus de</Label>
              <Select value={joursMinimum.toString()} onValueChange={(v) => setJoursMinimum(parseInt(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 jours</SelectItem>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="14">14 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résumé */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Devis en attente</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisNonSignes?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              depuis plus de {joursMinimum} jours
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relançables par email</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisAvecEmail.length}</div>
            <p className="text-xs text-muted-foreground">
              clients avec email
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sans email</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisSansEmail.length}</div>
            <p className="text-xs text-muted-foreground">
              relance manuelle requise
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Liste des devis */}
      {(!devisNonSignes || devisNonSignes.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">Aucun devis en attente</h3>
            <p className="text-muted-foreground text-center mt-2">
              Tous vos devis récents ont été signés ou sont trop récents pour une relance.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Devis à relancer</CardTitle>
            <CardDescription>
              {devisNonSignes.length} devis en attente de signature depuis plus de {joursMinimum} jours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 text-sm font-medium w-[110px]">Devis</th>
                    <th className="text-left p-2 text-sm font-medium">Client</th>
                    <th className="text-right p-2 text-sm font-medium w-[90px]">Montant</th>
                    <th className="text-center p-2 text-sm font-medium w-[90px] hidden lg:table-cell">Ancienneté</th>
                    <th className="text-center p-2 text-sm font-medium w-[80px]">Statut</th>
                    <th className="text-right p-2 text-sm font-medium w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devisNonSignes.map((item) => (
                    <tr key={item.devis.id} className="border-t">
                      <td className="p-2">
                        <Link href={`/devis/${item.devis.id}`} className="hover:underline">
                          <span className="font-medium text-sm">{item.devis.numero}</span>
                        </Link>
                      </td>
                      <td className="p-2 truncate">
                        <div className="truncate font-medium text-sm">{item.client?.nom || 'Client inconnu'}</div>
                        {item.client?.email ? (
                          <div className="text-xs text-muted-foreground truncate">{item.client.email}</div>
                        ) : (
                          <div className="text-xs text-orange-500">Pas d'email</div>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">
                        {formatCurrency(item.devis.totalTTC)}
                      </td>
                      <td className="p-2 text-center hidden lg:table-cell">
                        <Badge variant={item.joursDepuisCreation > 14 ? "destructive" : "secondary"}>
                          <Clock className="mr-1 h-3 w-3" />
                          {item.joursDepuisCreation} jours
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {item.signature ? (
                          <Badge variant="outline">
                            Lien envoyé
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            En attente
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          {item.client?.email ? (
                            <Button
                              size="sm"
                              onClick={() => handleRelance(item)}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Relancer
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                            >
                              <AlertCircle className="mr-2 h-4 w-4" />
                              Pas d'email
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de relance individuelle */}
      <Dialog open={showRelanceDialog} onOpenChange={setShowRelanceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Envoyer une relance</DialogTitle>
            <DialogDescription>
              Relance pour le devis {selectedDevis?.devis.numero} - {selectedDevis?.client?.nom}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Destinataire</Label>
              <Input value={selectedDevis?.client?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={messageRelance}
                onChange={(e) => setMessageRelance(e.target.value)}
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelanceDialog(false)}>
              Annuler
            </Button>
            <Button onClick={confirmRelance} disabled={envoyerRelanceMutation.isPending}>
              {envoyerRelanceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Envoyer la relance
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de relances automatiques */}
      <Dialog open={showAutoDialog} onOpenChange={setShowAutoDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Relances automatiques</DialogTitle>
            <DialogDescription>
              Envoyer des relances à tous les clients avec un email pour les devis en attente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Devis de plus de</Label>
              <Select value={joursMinimum.toString()} onValueChange={(v) => setJoursMinimum(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 jours</SelectItem>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="14">14 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Délai minimum entre relances</Label>
              <Select value={joursEntreRelances.toString()} onValueChange={(v) => setJoursEntreRelances(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 jours</SelectItem>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="14">14 jours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Les devis ayant reçu une relance récemment seront ignorés
              </p>
            </div>
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm">
                <strong>{devisAvecEmail.length}</strong> devis seront potentiellement relancés
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleRelancesAuto} disabled={envoyerRelancesAutoMutation.isPending}>
              {envoyerRelancesAutoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Lancer les relances
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de configuration des relances automatiques */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration des relances automatiques
            </DialogTitle>
            <DialogDescription>
              Configurez les paramètres pour l'envoi automatique des relances
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Activation */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Power className={`h-5 w-5 ${configRelance.actif ? "text-green-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium">Relances automatiques</p>
                  <p className="text-sm text-muted-foreground">
                    {configRelance.actif ? "Activées" : "Désactivées"}
                  </p>
                </div>
              </div>
              <Switch
                checked={configRelance.actif}
                onCheckedChange={(checked) => setConfigRelance({ ...configRelance, actif: checked })}
              />
            </div>

            {/* Paramètres */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Délai après envoi</Label>
                  <Select 
                    value={configRelance.joursApresEnvoi.toString()} 
                    onValueChange={(v) => setConfigRelance({ ...configRelance, joursApresEnvoi: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 jours</SelectItem>
                      <SelectItem value="5">5 jours</SelectItem>
                      <SelectItem value="7">7 jours</SelectItem>
                      <SelectItem value="10">10 jours</SelectItem>
                      <SelectItem value="14">14 jours</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Avant la 1ère relance</p>
                </div>
                <div className="space-y-2">
                  <Label>Entre les relances</Label>
                  <Select 
                    value={configRelance.joursEntreRelances.toString()} 
                    onValueChange={(v) => setConfigRelance({ ...configRelance, joursEntreRelances: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 jours</SelectItem>
                      <SelectItem value="5">5 jours</SelectItem>
                      <SelectItem value="7">7 jours</SelectItem>
                      <SelectItem value="10">10 jours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre max de relances</Label>
                  <Select 
                    value={configRelance.nombreMaxRelances.toString()} 
                    onValueChange={(v) => setConfigRelance({ ...configRelance, nombreMaxRelances: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 relance</SelectItem>
                      <SelectItem value="2">2 relances</SelectItem>
                      <SelectItem value="3">3 relances</SelectItem>
                      <SelectItem value="5">5 relances</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Heure d'envoi</Label>
                  <Select 
                    value={configRelance.heureEnvoi} 
                    onValueChange={(v) => setConfigRelance({ ...configRelance, heureEnvoi: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="08:00">08:00</SelectItem>
                      <SelectItem value="09:00">09:00</SelectItem>
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="14:00">14:00</SelectItem>
                      <SelectItem value="16:00">16:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Jours d'envoi
                </Label>
                <div className="flex flex-wrap gap-2">
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((jour, index) => {
                    const jourNum = (index + 1).toString();
                    const isSelected = configRelance.joursEnvoi.includes(jourNum);
                    return (
                      <Button
                        key={jour}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const jours = configRelance.joursEnvoi.split(",").filter(j => j);
                          if (isSelected) {
                            setConfigRelance({ 
                              ...configRelance, 
                              joursEnvoi: jours.filter(j => j !== jourNum).join(",") 
                            });
                          } else {
                            setConfigRelance({ 
                              ...configRelance, 
                              joursEnvoi: [...jours, jourNum].sort().join(",") 
                            });
                          }
                        }}
                      >
                        {jour}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Résumé */}
            {configRelance.actif && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  Les devis envoyés sans réponse recevront jusqu'à <strong>{configRelance.nombreMaxRelances}</strong> relance(s), 
                  la première après <strong>{configRelance.joursApresEnvoi}</strong> jours, 
                  puis toutes les <strong>{configRelance.joursEntreRelances}</strong> jours à <strong>{configRelance.heureEnvoi}</strong>.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Annuler
            </Button>
            <Button onClick={() => {
              toast.success(configRelance.actif ? "Relances automatiques activées" : "Relances automatiques désactivées");
              setShowConfigDialog(false);
            }}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
