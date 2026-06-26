import { Outlet, createRootRoute, Link, useNavigate } from "@tanstack/react-router";
import { trpc } from "../shared/trpc";

export const rootRoute = createRootRoute({
  component: () => {
    const navigate = useNavigate();
    const logout = trpc.auth.logout.useMutation({
      onSuccess: () => void navigate({ to: "/login" }),
    });

    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <nav style={{ padding: "12px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: "24px", background: "#1e293b", color: "white" }}>
          <span style={{ fontWeight: "bold", marginRight: "16px" }}>Operioz Admin</span>
          <Link to="/artisans" style={{ color: "#94a3b8", textDecoration: "none" }}>
            Artisans
          </Link>
          <Link to="/subscriptions" style={{ color: "#94a3b8", textDecoration: "none" }}>
            Abonnements
          </Link>
          <Link to="/events" style={{ color: "#94a3b8", textDecoration: "none" }}>Événements</Link>
          <button
            onClick={() => logout.mutate()}
            style={{ marginLeft: "auto", padding: "4px 12px", background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
          >
            Déconnexion
          </button>
        </nav>
        <main style={{ padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    );
  },
});
