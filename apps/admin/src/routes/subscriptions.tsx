import { useEffect } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { trpc } from "../shared/trpc";

function SubscriptionsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = trpc.platformAdmin.subscriptions.list.useQuery({ page: 1 });

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
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Abonnements ({data?.total ?? 0})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>ID</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Artisan ID</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Entreprise</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Plan</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Statut</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Fin d&apos;essai</th>
            <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #e2e8f0" }}>Fin de période</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.id}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.artisanId}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.nomEntreprise ?? "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.plan}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.status}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString("fr-FR") : "—"}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subscriptions",
  component: SubscriptionsPage,
});
