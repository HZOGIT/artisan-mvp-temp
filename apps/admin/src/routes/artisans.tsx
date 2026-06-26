import { useEffect } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { trpc } from "../shared/trpc";

function ArtisansPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.platformAdmin.artisans.list.useQuery({ page: 1 });
  const disable = trpc.platformAdmin.artisans.disable.useMutation({
    onSuccess: () => utils.platformAdmin.artisans.list.invalidate(),
  });
  const enable = trpc.platformAdmin.artisans.enable.useMutation({
    onSuccess: () => utils.platformAdmin.artisans.list.invalidate(),
  });

  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") {
      void navigate({ to: "/login" });
    }
  }, [error, navigate]);

  if (error?.data?.code === "UNAUTHORIZED") return null;
  if (error?.data?.code === "FORBIDDEN") {
    return <p style={{ color: "red", padding: "24px" }}>Accès refusé — compte staff Operioz requis.</p>;
  }

  if (isLoading) return <p>Chargement…</p>;
  if (error) return <p style={{ color: "red" }}>Erreur : {error.message}</p>;

  return (
    <div>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Artisans ({data?.total ?? 0})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>ID</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Entreprise</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>SIRET</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Email</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Plan</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>IP inscription</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Statut</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Créé le</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((a) => (
            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.id}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.nomEntreprise ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.siret ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.email ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.plan ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0", fontFamily: "monospace" }}>{a.registrationIp ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "600",
                  background: a.isActive ? "#dcfce7" : "#fee2e2",
                  color: a.isActive ? "#15803d" : "#b91c1c",
                }}>
                  {a.isActive ? "Actif" : "Désactivé"}
                </span>
              </td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                {a.isActive ? (
                  <button
                    onClick={() => {
                      if (confirm(`Désactiver l'artisan #${a.id} ?`)) {
                        disable.mutate({ id: a.id });
                      }
                    }}
                    disabled={disable.isPending}
                    style={{ padding: "4px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
                  >
                    Désactiver
                  </button>
                ) : (
                  <button
                    onClick={() => enable.mutate({ id: a.id })}
                    disabled={enable.isPending}
                    style={{ padding: "4px 10px", background: "#22c55e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
                  >
                    Réactiver
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const artisansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/artisans",
  component: ArtisansPage,
});
