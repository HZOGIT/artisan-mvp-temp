# Audit — Résilience client (React ErrorBoundary, écran blanc) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `client/src/App.tsx` (placement boundary), `components/ErrorBoundary.tsx`
> (implémentation), `main.tsx` (filets globaux), `components/DashboardLayout.tsx`.

---

## Conclusion : erreurs de rendu correctement capturées. Pas de BLOCKER/HIGH.

Risque cherché : une erreur de rendu non capturée (ex. déréférencement `null` quand une
donnée arrive d'une forme inattendue) **démonte tout l'arbre React** → **écran blanc**
sans message ni récupération. Classique en SPA, très visible au lancement.

### ErrorBoundary englobe toute l'application

```tsx
// App.tsx:271-281
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider><TooltipProvider>
        <Router />        {/* toutes les routes wouter */}
        <Toaster />
      </TooltipProvider></ThemeProvider>
    </ErrorBoundary>
  );
}
```

→ `getDerivedStateFromError` + `componentDidCatch` (classe React) capturent toute
exception de rendu sous le routeur.

### Fallback production sûr + récupération garantie

- **Pas de fuite technique en prod** : le stack trace n'est rendu que si
  `import.meta.env.PROD === false` (`<details>` dev only). En prod : message
  user-friendly « Oups ! Une erreur est survenue / vos données sont en sécurité ».
- **Sortie toujours possible** : boutons « Recharger la page » (`window.location.reload()`)
  et « Tableau de bord » (`window.location.href='/dashboard'`) → **hard reload** qui
  remonte l'arbre et **réinitialise** l'état d'erreur. Pas de fallback « collé »
  irrécupérable (la seule sortie force un rechargement complet).

### Télémétrie de crash

`componentDidCatch` envoie message + stack + componentStack via
`navigator.sendBeacon('/api/voice/debug', …)` (survit au démontage) → crashes visibles
côté serveur (utile en mobile sans devtools ; **complémentaire d'OPE-13** observabilité).

> À noter : contraste avec la résilience **serveur** (OPE-82) — côté **client**, le filet
> existe et est correct ; côté **process serveur**, il manque.

---

## Réserves mineures (non bloquantes)

1. **Boundary unique top-level** : une erreur dans une page démonte tout l'écran (fallback
   plein écran) plutôt que de confiner au sous-arbre fautif. Acceptable (le hard-reload
   récupère) ; granularité par-route = amélioration UX, pas un blocker.
2. `sendBeacon` tourne aussi en **prod** (commentaire « DEV ») → en pratique **bénéfique**
   (visibilité crash) ; le endpoint `/api/voice/debug` est réutilisé comme sink. Sans
   impact, à rebrancher proprement sur le sink OPE-13 le moment venu.
3. Filets globaux `window` (`main.tsx`) : `vite:preloadError` (chunk périmé) géré ; le net
   `unhandledrejection` a été **volontairement retiré** (causait une boucle de reload —
   déjà corrigé). OK.

---

## Verdict

La SPA est **protégée par un ErrorBoundary** englobant tout le routeur, avec fallback
**prod-safe** (aucune fuite de stack), **récupération garantie** (hard reload) et
**télémétrie** de crash. Pas d'écran blanc irrécupérable. **Pas de nouvelle issue
Linear.**
