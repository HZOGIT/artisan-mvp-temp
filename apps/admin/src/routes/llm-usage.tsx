import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { trpc } from "../shared/trpc";

const tdStyle = { padding: "8px 12px", border: "1px solid #e2e8f0", fontSize: "13px" };
const thStyle = { padding: "8px 12px", textAlign: "left" as const, border: "1px solid #e2e8f0" };

function LlmUsagePage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = trpc.platformAdmin.llmUsage.summary.useQuery({});

  if (error?.data?.code === "UNAUTHORIZED") {
    void navigate({ to: "/login" });
    return null;
  }
  if (error?.data?.code === "FORBIDDEN") {
    return <p style={{ color: "red", padding: "24px" }}>Accès refusé — compte staff Operioz requis.</p>;
  }

  return (
    <div>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Consommation LLM par artisan ({data?.length ?? 0})</h2>

      {isLoading && <p>Chargement…</p>}
      {error && !["UNAUTHORIZED", "FORBIDDEN"].includes(error.data?.code ?? "") && (
        <p style={{ color: "red" }}>Erreur : {error.message}</p>
      )}

      {data && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>Artisan</th>
              <th style={thStyle}>Appels</th>
              <th style={thStyle}>Tokens prompt</th>
              <th style={thStyle}>Tokens réponse</th>
              <th style={thStyle}>Total tokens</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.artisanId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={tdStyle}>{row.nomEntreprise ?? `Artisan #${row.artisanId}`}</td>
                <td style={tdStyle}>{Number(row.callCount).toLocaleString("fr-FR")}</td>
                <td style={tdStyle}>{Number(row.promptTokens).toLocaleString("fr-FR")}</td>
                <td style={tdStyle}>{Number(row.responseTokens).toLocaleString("fr-FR")}</td>
                <td style={{ ...tdStyle, fontWeight: "bold" }}>{Number(row.totalTokens).toLocaleString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const llmUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/llm-usage",
  component: LlmUsagePage,
});
