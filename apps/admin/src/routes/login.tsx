import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";

function LoginPage() {
  const apiUrl = import.meta.env.VITE_API_URL ?? "";
  return (
    <div style={{ maxWidth: "400px", margin: "80px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "24px" }}>Operioz Admin</h1>
      <p style={{ color: "#64748b", marginBottom: "32px" }}>Accès réservé au staff Operioz.</p>
      <a
        href={`${apiUrl}/api/auth/login`}
        style={{
          display: "inline-block",
          padding: "12px 32px",
          background: "#1e293b",
          color: "white",
          borderRadius: "6px",
          textDecoration: "none",
          fontWeight: "bold",
        }}
      >
        Se connecter
      </a>
    </div>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
