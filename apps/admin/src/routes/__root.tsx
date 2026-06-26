import { Outlet, createRootRoute, Link } from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: () => (
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
      </nav>
      <main style={{ padding: "24px" }}>
        <Outlet />
      </main>
    </div>
  ),
});
