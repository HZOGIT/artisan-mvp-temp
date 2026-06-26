import { useState } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { trpc } from "../shared/trpc";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginTop: "6px",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  fontSize: "14px",
  boxSizing: "border-box",
};

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signin = trpc.auth.adminSignin.useMutation({
    onSuccess: () => {
      void navigate({ to: "/artisans" });
    },
  });

  return (
    <div style={{ maxWidth: "360px", margin: "80px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Operioz Admin</h1>
      <p style={{ color: "#64748b", marginBottom: "32px" }}>Accès réservé au staff Operioz.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          signin.mutate({ email: email.trim(), password });
        }}
        style={{ textAlign: "left" }}
      >
        <label style={{ fontSize: "13px", color: "#334155" }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: "13px", color: "#334155", display: "block", marginTop: "16px" }}>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>
        {signin.error ? (
          <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "12px" }}>
            {signin.error.data?.code === "UNAUTHORIZED" ? "Email ou mot de passe incorrect." : signin.error.data?.code === "FORBIDDEN" ? "Accès réservé aux administrateurs." : signin.error.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={signin.isPending || !email || !password}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "12px",
            background: signin.isPending ? "#64748b" : "#1e293b",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontWeight: "bold",
            cursor: signin.isPending ? "default" : "pointer",
          }}
        >
          {signin.isPending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
