# Tâche : refetchOnWindowFocus + refetch post tool-call assistant (modern front)

## Contexte

Le nouveau frontend modern (`client/src/modern/`) partage le QueryClient instancié dans
`client/src/main.tsx`. Deux comportements à corriger/confirmer :

## 1. refetchOnWindowFocus: true dans le QueryClient global

**Fichier** : `client/src/main.tsx` ligne ~40
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,  // ← changer en true
    },
  },
});
```
→ Changer `false` en `true`.

Vérifier ensuite si des pages modern (`client/src/modern/**`) ont un override local
`refetchOnWindowFocus: false` et les supprimer s'il n'y a pas de raison intentionnelle.
(Les overrides dans `client/src/pages/` legacy peuvent rester — ne pas y toucher.)

## 2. Refetch après chaque tool call de l'assistant IA

Le mécanisme actuel :
- Backend envoie `{ invalidate: ["devis", "factures", ...] }` dans le stream SSE
- `client/src/hooks/useAssistantStream.ts:201` reçoit ces clés et appelle `onInvalidateRef.current?.(keys)`
- `client/src/components/DashboardLayout.tsx:862` : `queryClient.invalidateQueries(...)` sur ces clés

Ce mécanisme invalide déjà les queries React Query — y compris celles des pages modern
puisqu'elles partagent le même QueryClient. **Vérifier que c'est bien le cas** en lisant
`DashboardLayout.tsx:855-867` et `useAssistantStream.ts:195-202`.

Si le mécanisme couvre déjà les pages modern → documenter en commentaire dans `DashboardLayout.tsx`
que l'invalidation couvre aussi le modern. Pas de code supplémentaire nécessaire dans ce cas.

Si ce n'est pas le cas → trouver pourquoi et corriger.

## 3. Aussi : assistant vocal (voice)

La session vocale Gemini Live ne passe pas par `useAssistantStream`. Vérifier si les tool calls
vocaux déclenchent aussi une invalidation.
- Chercher : `client/src/` grep `voice\|gemini.*live\|liveSession\|toolCall` hors tests
- Si les tool calls vocaux n'invalident pas → ajouter l'invalidation via `queryClient.invalidateQueries`
  sur `['devis', 'factures', 'clients', 'stocks', 'commandes', 'notifications']` après chaque tool call réussi.

## Règles

- Commit chirurgical : `git add <fichiers explicites>`, jamais `git add -A`
- Ne pas toucher aux pages legacy (`client/src/pages/`) ni aux tests existants
- Vérifier TypeScript : `npx tsc --noEmit` sans erreurs nouvelles avant de commit
- Push sur `staging` après commit
