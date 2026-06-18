import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Pour la prod, on logue dans la console — le stack trace n'est PAS
    // expose a l'utilisateur final (UI user-friendly, voir render()).
    console.error("[App ErrorBoundary]", error, info);
    // DEV: ship the crash to the server so it's visible in the logs (mobile
    // debugging — no devtools). sendBeacon survives the unmount.
    try {
      const payload = JSON.stringify({
        events: [
          `ErrorBoundary: ${error?.message}`,
          `stack: ${(error?.stack || "").split("\n").slice(0, 5).join(" | ")}`,
          `componentStack: ${(info?.componentStack || "").split("\n").slice(0, 4).join(" | ")}`,
        ],
      });
      navigator.sendBeacon?.("/api/voice/debug", new Blob([payload], { type: "application/json" }));
    } catch { /* ignore */ }
  }

  override render() {
    if (this.state.hasError) {
      const isProd = (import.meta as any).env?.PROD;
      return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-50 via-rose-50/20 to-orange-50/30">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xl mb-5">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Oups ! Une erreur est survenue
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Ne vous inquiétez pas, vos données sont en sécurité.
              <br />
              Réessayez en rechargeant la page ou retournez au tableau de bord.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium text-sm transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Recharger la page
              </button>
              <button
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-md"
              >
                <Home className="h-4 w-4" /> Tableau de bord
              </button>
            </div>

            {/* Stack trace UNIQUEMENT en dev — masque en production pour ne
                pas exposer de details techniques aux utilisateurs finaux. */}
            {!isProd && this.state.error && (
              <details className="mt-8 text-left">
                <summary className="text-xs cursor-pointer text-slate-500 hover:text-slate-700">
                  Détails techniques (dev)
                </summary>
                <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded text-[10px] overflow-auto max-h-64">
                  {this.state.error.stack || this.state.error.message}
                </pre>
              </details>
            )}

            <p className="mt-8 text-xs text-slate-500">
              Si le problème persiste, contactez{" "}
              <a href="mailto:support@operioz.com" className="text-blue-600 hover:underline">
                support@operioz.com
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
