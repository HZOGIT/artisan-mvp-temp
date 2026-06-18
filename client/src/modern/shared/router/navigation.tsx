import { useSyncExternalStore, useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";

// Navigation du front neuf SANS wouter : s'appuie sur l'History API + un popstate synthétique pour notifier
// TOUS les routeurs montés (le routeur TanStack /v2 ET wouter pendant la transition écoutent `popstate`).
// API compatible avec l'usage wouter du code modern (useLocation/useSearch/Link) → migration mécanique.

function notify() {
  // popstate synthétique : re-route TanStack (/v2) + wouter (legacy entry) qui écoutent tous deux popstate.
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function navigate(to: string): void {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", to);
  notify();
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
