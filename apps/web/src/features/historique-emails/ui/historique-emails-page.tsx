import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEmails } from "../application/use-emails";
import {
  emailStatutKind,
  filterByStatut,
  STATUT_FILTRES,
  type EmailLog,
} from "../domain/email-log";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Mail, RefreshCw, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import type { TFunction } from "i18next";

// Page Historique des emails du FRONT NEUF (`/historique-emails`) — MIGRATION clean-archi de
// `pages/HistoriqueEmails.tsx` (lecture seule ; legacy chaînes EN DUR → i18n namespace `historiqueEmails`).
// Données via `useEmails` (couche application, seule à importer tRPC) ; filtre & catégorie de statut via
// le domaine (fonctions pures testées). Présentation pure, 0 `any` (le legacy castait `data as EmailLogRow[]`).

const FILTER_LABEL: Record<(typeof STATUT_FILTRES)[number], string> = {
  tous: "filterTous",
  envoye: "filterEnvoye",
  echec: "filterEchec",
  simule: "filterSimule",
};

function StatutBadge({ statut, t }: { statut: string; t: TFunction<"historiqueEmails"> }) {
  switch (emailStatutKind(statut)) {
    case "envoye":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" /> {t("badgeEnvoye")}
        </Badge>
      );
    case "echec":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> {t("badgeEchec")}
        </Badge>
      );
    case "simule":
      return (
        <Badge variant="secondary">
          <FlaskConical className="mr-1 h-3 w-3" /> {t("badgeSimule")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{statut}</Badge>;
  }
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoriqueEmailsPage() {
  const { t } = useTranslation("historiqueEmails");
  const [statutFiltre, setStatutFiltre] = useState<string>("tous");
  const { emails, isLoading, isFetching, refresh } = useEmails();

  const rows = filterByStatut(emails, statutFiltre);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Mail className="h-6 w-6" /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("cardTitle")}</CardTitle>
            <CardDescription>
              {isLoading ? t("loading") : t("countDisplayed", { n: rows.length })}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {STATUT_FILTRES.map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={statutFiltre === f ? "default" : "outline"}
                  onClick={() => setStatutFiltre(f)}
                >
                  {t(FILTER_LABEL[f])}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => refresh()} disabled={isFetching}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingFull")}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {statutFiltre !== "tous" ? t("emptyFiltered") : t("emptyNone")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("thDate")}</TableHead>
                    <TableHead>{t("thDestinataire")}</TableHead>
                    <TableHead>{t("thSujet")}</TableHead>
                    <TableHead>{t("thType")}</TableHead>
                    <TableHead>{t("thStatut")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: EmailLog) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.destinataire}>
                        {row.destinataire}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate" title={row.sujet}>
                        {row.sujet}
                      </TableCell>
                      <TableCell>
                        {row.type ? <Badge variant="outline">{row.type}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatutBadge statut={row.statut} t={t} />
                          {row.statut === "echec" && row.erreur ? (
                            <span className="max-w-[220px] truncate text-xs text-destructive" title={row.erreur}>
                              {row.erreur}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
