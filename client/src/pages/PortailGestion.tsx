import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Globe, Send, Copy, RefreshCw, ShieldOff, Search, Loader2, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function PortailGestion() {
  const [search, setSearch] = useState("");

  const { data: clients, isLoading } = trpc.clients.list.useQuery();

  // Fetch portal status for all clients
  const portalQueries = (clients || []).map((client) => ({
    clientId: client.id,
    client,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Portail Client</h1>
          <p className="text-muted-foreground">Gérez l'accès en ligne de vos clients à leurs documents</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {(clients || [])
            .filter((c) => {
              if (!search) return true;
              const q = search.toLowerCase();
              return (
                c.nom.toLowerCase().includes(q) ||
                (c.prenom || "").toLowerCase().includes(q) ||
                (c.email || "").toLowerCase().includes(q)
              );
            })
            .map((client) => (
              <PortailClientRow key={client.id} client={client} />
            ))}
        </div>
      )}
    </div>
  );
}

function PortailClientRow({ client }: { client: any }) {
  const { data: portalStatus, refetch } = trpc.clientPortal.getStatus.useQuery(
    { clientId: client.id },
    { staleTime: 30000 }
  );

  const generateAccess = trpc.clientPortal.generateAccess.useMutation({
    onSuccess: (data) => {
      toast.success(`Accès portail envoyé à ${client.email}`);
      navigator.clipboard.writeText(data.url).catch(() => {});
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deactivateAccess = trpc.clientPortal.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Portail désactivé");
      refetch();
    },
  });

  const isExpired = portalStatus?.dateExpiration
    ? new Date(portalStatus.dateExpiration) < new Date()
    : false;
  const isActive = portalStatus && !isExpired;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Client info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-semibold">
                {client.prenom} {client.nom}
              </span>
              {isActive ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Actif
                </Badge>
              ) : isExpired ? (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Expiré
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                  <XCircle className="h-3 w-3 mr-1" />
                  Inactif
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {client.email || "Pas d'email"}
              {isActive && portalStatus?.dateExpiration && (
                <span className="ml-2 text-xs">
                  — Expire le {format(new Date(portalStatus.dateExpiration), "dd/MM/yyyy")}
                  {portalStatus.lastAccessAt && (
                    <> — Dernier accès : {format(new Date(portalStatus.lastAccessAt), "dd/MM/yyyy HH:mm", { locale: fr })}</>
                  )}
                </span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isActive && portalStatus?.token && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url = `${window.location.origin}/portail/${portalStatus.token}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Lien copié !");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                >
                  <a href={`/portail/${portalStatus.token}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Voir
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateAccess.mutate({ clientId: client.id })}
                  disabled={generateAccess.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Renouveler
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deactivateAccess.mutate({ clientId: client.id })}
                  disabled={deactivateAccess.isPending}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {!isActive && (
              <Button
                size="sm"
                onClick={() => generateAccess.mutate({ clientId: client.id })}
                disabled={generateAccess.isPending || !client.email}
              >
                {generateAccess.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                {client.email ? "Envoyer l'accès" : "Email requis"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
