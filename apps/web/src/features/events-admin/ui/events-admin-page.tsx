import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/shared/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function PayloadCell({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);
  if (!payload) return <span className="text-muted-foreground">—</span>;
  const str = JSON.stringify(payload, null, 2);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-primary underline cursor-pointer">
        {JSON.stringify(payload).slice(0, 40)}{JSON.stringify(payload).length > 40 ? "…" : ""}
      </button>
    );
  }
  return (
    <pre className="text-xs bg-muted p-1 rounded max-w-xs max-h-40 overflow-auto cursor-pointer" onClick={() => setOpen(false)}>
      {str}
    </pre>
  );
}

export default function EventsAdminPage() {
  const { t } = useTranslation("events-admin");
  const [page, setPage] = useState(1);
  const [typeInput, setTypeInput] = useState("");

  const type = typeInput.trim() || undefined;

  const { data, isLoading, isFetching, refetch } = trpc.events.list.useQuery({ page, type });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("type")}</label>
          <Input className="w-52" value={typeInput} onChange={(e) => { setTypeInput(e.target.value); setPage(1); }} placeholder="ex. FACTURE_PAYEE" />
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isLoading ? t("loading") : `${total} ${t(total !== 1 ? "events" : "event")}`}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("no_events")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("date")}</TableHead>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("entity")}</TableHead>
                    <TableHead>{t("payload")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(row.occurredAt ?? row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{row.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{row.entityType}</span>
                        {" #"}{row.entityId}
                      </TableCell>
                      <TableCell><PayloadCell payload={row.payload} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">{t("page", { page, totalPages })}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
