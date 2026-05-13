/**
 * Skeleton générique pour le chargement des widgets dashboard. Utilise
 * l'utilitaire Tailwind `animate-pulse` — pas de dépendance supplémentaire.
 */
export function WidgetSkeleton({ height = 200, lines = 0 }: { height?: number; lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse" style={{ minHeight: height }}>
      <div
        className="rounded-md bg-muted/60"
        style={{ height: lines > 0 ? 80 : height - 16 }}
      />
      {lines > 0 &&
        Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 bg-muted/60 rounded" style={{ width: `${100 - i * 8}%` }} />
        ))}
    </div>
  );
}
