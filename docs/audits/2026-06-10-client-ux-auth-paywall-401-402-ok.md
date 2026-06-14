# Audit — UX client des états auth/paywall (401 / 402 / 403) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `main.tsx` (links tRPC), `useAuth` (`_core/hooks/useAuth.ts`),
> `DashboardLayout` (`:700-738`), `ExpiredBlocker`, `App.tsx` (routage).

---

## Conclusion : états non-authentifié / abonnement-expiré gérés proprement. Pas de BLOCKER/HIGH.

Enjeu : à l'**expiration du JWT (7 j)** ou à l'**expiration de l'abonnement** (point de
conversion !), le client doit afficher un écran clair (login / renouvellement) et **pas un
shell cassé** de requêtes en échec.

### 401 / non authentifié → écran « Connexion requise » (pas de shell cassé)

`DashboardLayout` (qui enveloppe **toutes** les routes authentifiées) appelle `useAuth()`
→ `trpc.auth.me.useQuery()`. Garde explicite (`:703-727`) :

- `if (loading) return <DashboardLayoutSkeleton/>` ;
- `if (!user)` → écran **« Connexion requise »** + bouton **« Se connecter »**
  (`getLoginUrl()`).

→ Un utilisateur déconnecté / JWT expiré sur `/dashboard` voit un écran **intentionnel**,
pas une page vide aux requêtes 401. (Pas de redirection auto, mais prompt explicite —
acceptable.)

### 402 / abonnement expiré → `ExpiredBlocker` (proactif)

`DashboardLayoutContent` lit `trpc.subscription.getCurrent` (procédure **whitelistée** par
`subscriptionGuard`, donc **réussit même expiré**) → `ExpiredBlocker` affiche le **blocage
+ renouvellement** quand `status` ∈ {expired, canceled échu, trialing épuisé}. Le 402 du
garde n'est qu'un **backstop** ; l'UX primaire est proactive.

### Cohérence auth

`useAuth` : `auth.me` pour l'état ; `logout` → `queryClient.clear()` + `setLocation
("/signin")` (`:22-27`) — corrige le bug « rien ne se passe » au logout (cache 5 min).
`credentials: 'include'` sur le link tRPC (`main.tsx:53`) → cookies envoyés.

---

## Réserves (LOW)

1. **Deux patterns d'auth** : l'option `redirectOnUnauthenticated` de `useAuth` (`:31`)
   n'est **pas** utilisée par `DashboardLayout` (qui s'appuie sur le rendu `!user`). Les
   deux fonctionnent ; léger doublon à harmoniser.
2. **`/onboarding`** est rendu **hors** `DashboardLayout` (`App.tsx:145-147`) → un accès
   direct **non authentifié** à `/onboarding` n'a pas le garde `!user` (les requêtes
   401 donneraient un écran dégradé). Cas limite (post-signup on est authentifié). LOW.
3. **403 `device_limit_reached`** : remonté en erreur de requête (toast), pas d'écran
   dédié — rare, acceptable.

---

## Verdict

Le client gère **gracieusement** le non-authentifié (« Connexion requise » + bouton) et
l'abonnement expiré (`ExpiredBlocker` proactif via une procédure whitelistée) → pas de
shell cassé au moment critique. Réserves = cohérence/edge-cases **LOW**. **Pas de nouvelle
issue Linear.**
