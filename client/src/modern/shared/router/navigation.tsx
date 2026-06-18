import { useSyncExternalStore, useCallback, useEffect, type AnchorHTMLAttributes, type ReactNode } from "react";

// Navigation du front neuf SANS wouter : s'appuie sur l'History API + un popstate synthétique pour notifier
// TOUS les routeurs montés (le routeur TanStack /v2 écoute `popstate`). API compatible avec l'usage wouter du
// code modern (useLocation/useSearch/Link/Redirect) → wouter entièrement remplacé.

function notify() {
  // popstate synthétique : re-route le(s) routeur(s) montés (TanStack /v2) qui écoutent popstate.
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function navigate(to: string, opts?: { replace?: boolean }): void {
  if (typeof window === "undefined") return;
  if (opts?.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  notify();
}

// Redirection déclarative (équivalent wouter <Redirect>) : remplace l'entrée d'historique (replace) puis ne rend rien.
export function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}
function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}
export function useLocation(): [string, (to: string) => void] {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
  return [pathname, useCallback((to: string) => navigate(to), [])];
}
export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search, () => "");
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to?: string; href?: string; children?: ReactNode };
export function Link({ to, href, onClick, children, ...rest }: LinkProps) {
  const target = to ?? href ?? "";
  return (
    <a
      href={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(target);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
