import { useLocation } from "wouter";
import { useEffect } from "react";

export default function SignInPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // BYPASS CLERK - Redirect directly to dashboard
    navigate("/dashboard");
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-lg text-foreground">Redirection en cours...</p>
      </div>
    </div>
  );
}
