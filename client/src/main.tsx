import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from './lib/trpc'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

// Auto-reparation des chunks perimes apres deploiement.
// Quand un import dynamique echoue (vieux hash de chunk supprime cote serveur),
// Vite emet 'vite:preloadError'. On recharge la page UNE fois pour recuperer
// l'index.html frais (qui pointe vers les nouveaux hashes). Garde anti-boucle
// via sessionStorage. Couvre le cas d'un onglet reste ouvert pendant un deploy.
// STRICTEMENT une seule fois par session (flag persistant, jamais efface) et
// UNIQUEMENT sur vite:preloadError (un vrai echec d'import dynamique). On NE
// recharge PAS si sessionStorage est indisponible — sinon risque de boucle
// infinie ("charge en boucle"). On a retire le filet 'unhandledrejection' (trop
// large) et le handler 'load' qui effacait le flag (re-autorisait la boucle).
const RELOAD_FLAG = 'operioz:chunk-reloaded'
function reloadOnceForStaleChunk() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    return // pas de storage fiable -> on ne recharge pas (anti-boucle)
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
      // staleTime : valeur par défaut de React Query (0) — les données sont considérées
      // périmées immédiatement (refetch au remontage/refocus selon les autres options).
      refetchOnWindowFocus: true,
    },
  },
})

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      // FIX: Envoyer les cookies avec chaque requete
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
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
