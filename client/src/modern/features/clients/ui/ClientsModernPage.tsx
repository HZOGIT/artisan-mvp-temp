import { useClients } from "../application/use-clients";
import { nomComplet } from "../domain/client";

// Page PoC OPE-366 — réécriture de la liste clients sur la stack cible (clean archi + REST typé).
// Cohabite avec le legacy : montée sur `/v2/clients` dans le routeur wouter actuel (DashboardLayout
// conservé). Aucune dépendance à tRPC : data via `useClients()` → openapi-react-query → /api/rest/clients.
export default function ClientsModernPage() {
  const { clients, isLoading, isError, refetch } = useClients();

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Stack cible (PoC) — REST <code>/api/rest/clients</code> via client openapi-typescript.
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
