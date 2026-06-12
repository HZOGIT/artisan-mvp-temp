import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, CheckCircle2, XCircle, FlaskConical } from "lucide-react";

// OPE-114 — Historique des envois d'emails (lecture seule, scopé au tenant).
// Surface le journal `emails_log` déjà persisté par sendEmail via l'endpoint
// `emails.list`. Aucune mutation : vue de consultation/diagnostic de délivrabilité.

type EmailLogRow = {
  id: number;
  destinataire: string;
  sujet: string;
  type?: string | null;
  resendId?: string | null;
  statut: string;
  erreur?: string | null;
  entiteType?: string | null;
  entiteId?: number | null;
  createdAt: string | Date;
};

const STATUT_FILTRES = [
  { value: "tous", label: "Tous" },
  { value: "envoye", label: "Envoyés" },
  { value: "echec", label: "Échecs" },
  { value: "simule", label: "Simulés" },
] as const;

function StatutBadge({ statut }: { statut: string }) {
  if (statut === "envoye") {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Envoyé
      </Badge>
    );
  }
  if (statut === "echec") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" /> Échec
      </Badge>
    );
  }
  if (statut === "simule") {
    return (
      <Badge variant="secondary">
        <FlaskConical className="mr-1 h-3 w-3" /> Simulé
      </Badge>
    );
  }
  return <Badge variant="outline">{statut}</Badge>;
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

export default function HistoriqueEmails() {
  const [statutFiltre, setStatutFiltre] = useState<string>("tous");
  const { data, isLoading, refetch, isFetching } = trpc.emails.list.useQuery({ limit: 200 });

  const rows = ((data as EmailLogRow[] | undefined) ?? []).filter(
    (r) => statutFiltre === "tous" || r.statut === statutFiltre,
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Mail className="h-6 w-6" /> Historique des emails
        </h1>
        <p className="text-sm text-muted-foreground">
          Journal des emails envoyés depuis Operioz (devis, factures, relances, portail…). Lecture seule.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Derniers envois</CardTitle>
            <CardDescription>
              {isLoading ? "Chargement…" : `${rows.length} email(s) affiché(s)`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {STATUT_FILTRES.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={statutFiltre === f.value ? "default" : "outline"}
                  onClick={() => setStatutFiltre(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chargement de l'historique…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun email {statutFiltre !== "tous" ? "pour ce filtre" : "envoyé pour le moment"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead>Destinataire</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
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
                          <StatutBadge statut={row.statut} />
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
