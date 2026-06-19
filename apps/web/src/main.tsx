import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from './shared/trpc'
import { httpBatchLink, httpLink, splitLink } from '@trpc/client'
import superjson from 'superjson'

/*
 * Auto-reparation des chunks perimes apres deploiement.
 * Quand un import dynamique echoue (vieux hash de chunk supprime cote serveur),
 * Vite emet 'vite:preloadError'. On recharge la page UNE fois pour recuperer
 * l'index.html frais (qui pointe vers les nouveaux hashes). Garde anti-boucle
 * via sessionStorage. Couvre le cas d'un onglet reste ouvert pendant un deploy.
 * STRICTEMENT une seule fois par session (flag persistant, jamais efface) et
 * UNIQUEMENT sur vite:preloadError (un vrai echec d'import dynamique). On NE
 * recharge PAS si sessionStorage est indisponible — sinon risque de boucle
 * infinie ("charge en boucle"). On a retire le filet 'unhandledrejection' (trop
 * large) et le handler 'load' qui effacait le flag (re-autorisait la boucle).
 */
const RELOAD_FLAG = 'operioz:chunk-reloaded'
/*
 * Anti-boucle FENÊTRÉ (pas « une seule fois pour toujours ») : on recharge si le dernier rechargement
 * pour chunk périmé date de PLUS de 30 s. Ça récupère les déploiements SUCCESSIFS dans une même session
 * (un onglet resté ouvert pendant plusieurs deploys) tout en bloquant une vraie boucle (< 30 s).
 */
const RELOAD_COOLDOWN_MS = 30_000
function reloadOnceForStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
    /** déjà rechargé très récemment -> anti-boucle */
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    /** pas de storage fiable -> on ne recharge pas (anti-boucle) */
    return
  }
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnceForStaleChunk()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * staleTime : valeur par défaut de React Query (0) — les données sont considérées
       * périmées immédiatement (refetch au remontage/refocus selon les autres options).
       */
      refetchOnWindowFocus: true,
    },
  },
})

/** FIX: Envoyer les cookies avec chaque requete (host-only auth cookie `token`). */
const fetchWithCreds: typeof fetch = (url, options) =>
  fetch(url, { ...options, credentials: 'include' })

/*
 * Le Dashboard tire ses blocs depuis de nombreux endpoints. Avec un `httpBatchLink` unique, ces requetes
 * sont REGROUPEES dans UN seul appel HTTP qui ne resout que lorsque la PLUS LENTE est prete -> TOUS les
 * blocs attendent le plus lent (rendu fige). On de-batche donc les endpoints des widgets du dashboard via
 * un `httpLink` dedie (1 requete par bloc -> chaque bloc s'affiche des que SA donnee arrive = rendu
 * progressif). Le reste de l'app garde le batching (1 requete groupee).
 * NB : ces procedures peuvent aussi etre appelees ailleurs (ex. `stocks.getLowStock`, `activites.list`) ;
 * elles y feront alors une requete individuelle (cout negligeable). Ajouter ici tout nouvel endpoint de
 * widget dashboard pour le garder hors batch.
 */
const DASHBOARD_UNBATCHED = new Set([
  'conseilsIA',
  'statistiques.getDevisStats',
  'activites.list',
  'previsions.getTresoreriePrevisionnelle',
  'commandesFournisseurs.getEnRetard',
  'contrats.getAFacturer',
  'stocks.getLowStock',
])
const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.path.startsWith('dashboard.') || DASHBOARD_UNBATCHED.has(op.path),
      true: httpLink({ url: '/api/trpc', transformer: superjson, fetch: fetchWithCreds }),
      false: httpBatchLink({ url: '/api/trpc', transformer: superjson, fetch: fetchWithCreds }),
    }),
  ],
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
)
