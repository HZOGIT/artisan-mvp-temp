import { useState, useEffect } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { rootRoute } from "./__root";
import { trpc } from "../shared/trpc";

const tdStyle = { padding: "8px 12px", border: "1px solid #e2e8f0", fontSize: "13px" };
const thStyle = { padding: "8px 12px", textAlign: "left" as const, border: "1px solid #e2e8f0" };

function EventsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [artisanIdInput, setArtisanIdInput] = useState("");
  const [typeInput, setTypeInput] = useState("");
  const [artisanId, setArtisanId] = useState<number | undefined>(undefined);
  const [type, setType] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = trpc.platformAdmin.events.list.useQuery(
    { page, artisanId, type },
    { placeholderData: keepPreviousData },
  );

  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") {
      void navigate({ to: "/login" });
    }
  }, [error, navigate]);

  if (error?.data?.code === "UNAUTHORIZED") return null;
  if (error?.data?.code === "FORBIDDEN") {
    return <p style={{ color: "red", padding: "24px" }}>Accès refusé — compte staff Operioz requis.</p>;
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  function handleFilter() {
    setPage(1);
    const parsed = parseInt(artisanIdInput, 10);
    setArtisanId(artisanIdInput !== "" && !isNaN(parsed) ? parsed : undefined);
    setType(typeInput !== "" ? typeInput : undefined);
  }

  return (
    <div>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Événements ({data?.total ?? 0})</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <input
          type="number"
          placeholder="Artisan ID"
          value={artisanIdInput}
          onChange={(e) => setArtisanIdInput(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "4px", width: "120px" }}
        />
        <input
          type="text"
          placeholder="Type (action)"
          value={typeInput}
          onChange={(e) => setTypeInput(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "4px", width: "180px" }}
        />
        <button
          onClick={handleFilter}
          style={{ padding: "6px 14px", background: "#1e293b", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          Filtrer
        </button>
      </div>

      {isLoading && <p>Chargement…</p>}
      {error && !["UNAUTHORIZED", "FORBIDDEN"].includes(error.data?.code ?? "") && (
        <p style={{ color: "red" }}>Erreur : {error.message}</p>
      )}

      {data && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Artisan</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Entité</th>
                <th style={thStyle}>EntitéID</th>
                <th style={thStyle}>Payload</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((ev) => (
                <tr key={ev.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>{ev.id}</td>
                  <td style={tdStyle}>{ev.artisanId ?? "—"}</td>
                  <td style={tdStyle}>{ev.action}</td>
                  <td style={tdStyle}>{ev.entityType ?? "—"}</td>
                  <td style={tdStyle}>{ev.entityId ?? "—"}</td>
                  <td style={tdStyle}>
                    {ev.payload ? (
                      <details>
                        <summary style={{ cursor: "pointer" }}>
                          {JSON.stringify(ev.payload).slice(0, 40)}…
                        </summary>
                        <pre style={{ fontSize: "11px", marginTop: "4px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </details>
                    ) : "—"}
                  </td>
                  <td style={tdStyle}>{ev.createdAt ? new Date(ev.createdAt).toLocaleString("fr-FR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "16px" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: "6px 14px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}
            >
              Précédent
            </button>
            <span>Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              style={{ padding: "6px 14px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/events",
  component: EventsPage,
});
