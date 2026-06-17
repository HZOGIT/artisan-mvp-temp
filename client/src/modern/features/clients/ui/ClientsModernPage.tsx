import { useClients } from "../application/use-clients";
import { nomComplet } from "../domain/client";

// Liste clients du front neuf (clean archi) — montée sur `/v2/clients` via le socle TanStack Router,
// dans le DashboardLayout legacy. Données via le client tRPC PARTAGÉ (`useClients()` → `clients.list`,
// cf. `modern/shared/trpc`) — tRPC conservé, plus de REST.
export default function ClientsModernPage() {
  const { clients, isLoading, isError, refetch } = useClients();

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Stack cible — données via tRPC <code>clients.list</code> (client partagé).
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Rafraîchir
        </button>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {isError && (
        <p className="text-sm text-destructive">Impossible de charger les clients (réessayez).</p>
      )}

      {!isLoading && !isError && (
        <div className="rounded-lg border divide-y">
          {clients.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Aucun client.</p>
          )}
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{nomComplet(c)}</p>
                <p className="text-xs text-muted-foreground">
                  {c.email ?? "—"} · {c.ville ?? "—"}
                </p>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {c.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
