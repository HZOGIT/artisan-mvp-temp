import { useEffect, type AnchorHTMLAttributes, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { modernRouter } from "./router";

/*
 * Abstraction de navigation UNIFIÉE du front neuf. Façade unique (useLocation/useSearch/navigate/Link/
 * Redirect) consommée par tout le code modern — mais désormais adossée au SEUL routeur TanStack
 * (`modernRouter`). Lecture via `useRouterState` (source de vérité du routeur), écriture via son
 * `history` natif. Plus de `popstate` synthétique : un seul système de routage, donc plus de désync
 * lecture/écriture (cause de la boucle onboarding↔dashboard sur les comptes neufs).
 */

export function navigate(to: string, opts?: { replace?: boolean }): void {
  if (typeof window === "undefined") return;
  if (opts?.replace) modernRouter.history.replace(to);
  else modernRouter.history.push(to);
}

/** Redirection déclarative : remplace l'entrée d'historique (replace) puis ne rend rien. */
export function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

/** `[pathname, setLocation]` — pathname lu du routeur TanStack (source de vérité, pas de window.location stale). */
export function useLocation(): [string, (to: string) => void] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return [pathname, navigate];
}

/** Chaîne de query (ex. `?filtre=alerte`) lue du routeur TanStack. Compatible `new URLSearchParams(...)`. */
export function useSearch(): string {
  return useRouterState({ select: (s) => s.location.searchStr });
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
