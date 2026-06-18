import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePortailClients, useClientPortail } from "../application/use-portail-gestion";
import { filterClients, portalState, type PortailClient } from "../domain/portail-gestion";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Send, Copy, RefreshCw, ShieldOff, Search, Loader2, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Page Gestion du Portail Client du FRONT NEUF (`/portail-gestion`) — MIGRATION clean-archi de
// `pages/PortailGestion.tsx` (page legacy en chaînes en dur → désormais i18n namespace `portailGestion`).
// Données & mutations via `usePortailClients`/`useClientPortail` (couche application, seule à importer
// tRPC) ; recherche & état d'accès via le domaine (fonctions pures testées). Présentation pure, 0 `any`.

export default function PortailGestionPage() {
  const { t } = useTranslation("portailGestion");
  const [search, setSearch] = useState("");
  const { clients, isLoading } = usePortailClients();

  const filtered = filterClients(clients, search);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
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
          {filtered.map((client) => (
            <PortailClientRow key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortailClientRow({ client }: { client: PortailClient }) {
  const { t } = useTranslation("portailGestion");
  const { status: portalStatus, generateAccess, deactivate } = useClientPortail(client.id);

  const state = portalState(portalStatus);
  const isActive = state === "actif";

  const handleGenerate = () =>
    generateAccess.mutate(
      { clientId: client.id },
      {
        onSuccess: (data) => {
          toast.success(t("toastSent", { email: client.email }));
          navigator.clipboard.writeText(data.url).catch(() => {});
        },
        onError: (err) => toast.error(err.message),
      },
    );

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
              {state === "actif" ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {t("badgeActif")}
                </Badge>
              ) : state === "expire" ? (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Clock className="h-3 w-3 mr-1" />
                  {t("badgeExpire")}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                  <XCircle className="h-3 w-3 mr-1" />
                  {t("badgeInactif")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {client.email || t("noEmail")}
              {isActive && portalStatus?.dateExpiration && (
                <span className="ml-2 text-xs">
                  — {t("expireLe", { date: format(new Date(portalStatus.dateExpiration), "dd/MM/yyyy") })}
                  {portalStatus.lastAccessAt && (
                    <> — {t("dernierAcces", { date: format(new Date(portalStatus.lastAccessAt), "dd/MM/yyyy HH:mm", { locale: fr }) })}</>
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
                    toast.success(t("toastLinkCopied"));
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  {t("copier")}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/portail/${portalStatus.token}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    {t("voir")}
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generateAccess.isPending}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {t("renouveler")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() =>
                    deactivate.mutate(
                      { clientId: client.id },
                      { onSuccess: () => toast.success(t("toastDeactivated")) },
                    )
                  }
                  disabled={deactivate.isPending}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {!isActive && (
              <Button size="sm" onClick={handleGenerate} disabled={generateAccess.isPending || !client.email}>
                {generateAccess.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                {client.email ? t("envoyerAcces") : t("emailRequis")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
