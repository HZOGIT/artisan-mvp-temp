// Route de démonstration du socle `/v2` (TanStack Router). Sert UNIQUEMENT à prouver que le routeur
// neuf est monté, partage les providers (QueryClient + tRPC + auth) du legacy et résout une route
// enfant lazy. Aucune donnée, aucun impact visuel sur les pages réelles : elle vit sous `/v2/ping`.
export default function PingPage() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">/v2 — ping</h1>
      <p className="text-sm text-muted-foreground">
        Socle TanStack Router monté sur <code>/v2/*</code> (cohabite avec wouter). Si cette page
        s'affiche, le routeur neuf, le lazy-loading et les providers partagés fonctionnent.
      </p>
      <pre className="rounded-md border bg-muted px-3 py-2 text-xs">pong</pre>
    </div>
  );
}
