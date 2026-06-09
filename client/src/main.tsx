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
const RELOAD_FLAG = 'operioz:chunk-reloaded'
function reloadOnceForStaleChunk() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    window.location.reload()
  } catch {
    window.location.reload()
  }
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnceForStaleChunk()
})
// Filet supplementaire : certains echecs d'import remontent en 'unhandledrejection'.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e?.reason && (e.reason.message || e.reason)) || '')
  if (/dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg)) {
    reloadOnceForStaleChunk()
  }
})
// Au chargement reussi, on libere le flag pour autoriser un futur reload.
window.addEventListener('load', () => {
  try { sessionStorage.removeItem(RELOAD_FLAG) } catch {}
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
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
