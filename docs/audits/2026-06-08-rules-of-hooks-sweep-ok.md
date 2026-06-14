# Audit — Rules of Hooks (React #310) : sweep client après le crash /parametres — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Motivé par le crash **`/parametres`** (React error #310 « Rendered more hooks
> than during the previous render ») : hooks `useSearch/useLocation/useState/
> useEffect` appelés **après** un `if (isLoading) return` → corrigé (commit
> `7f23c32`) et **déployé en staging** (bundle `Parametres-BBviLBgA.js`). But du
> sweep : vérifier que ce n'est pas systémique.

---

## Conclusion : le bug `/parametres` était **isolé**. Pas d'autre violation. Pas de BLOCKER/HIGH.

### Méthode

Scanner heuristique sur **tout** `client/src/pages` + `components` : repérer un
hook au niveau composant (indent 2) appelé **après** un early-return de **rendu**
(guard d'état chargement/données retournant JSX/null). 5 candidats → **tous
vérifiés manuellement**.

### Résultat : 5/5 faux positifs (guard et hook dans des scopes différents)

| Fichier | Guard | Hook trouvé | Verdict |
| -- | -- | -- | -- |
| `Profil.tsx` | `if(isLoading)` @114 (`Profil`) | `useAuth` @362 — **`AccountSettings`** (l.361) | scopes ≠ |
| `Flotte.tsx` | `if(!dateStr) return null` @31 (helper module) | `useMemo` @42 (`Flotte` l.36) | guard hors composant |
| `Home.tsx` | `if(loading)` @131 | `useScrolled` @167 — **`Navbar`** (l.160) | scopes ≠ |
| `DashboardLayout.tsx` | `if(!count) return null` @554 | `useLocation` @563 — **`NotificationBell`** (l.562) | scopes ≠ |
| `ui/chart.tsx` | `if(!colorConfig.length)` @75 | `useChart` @127 — **`ChartTooltipContent`** (l.105) | scopes ≠ |

Dans chaque cas, une **déclaration de fonction/composant** s'intercale entre le
guard et le hook → le hook appartient à un autre composant. Aucun composant n'a de
hook de rendu **après** son propre early-return (hors `/parametres`, déjà corrigé).

---

## Cause racine (pourquoi c'est parti en prod sans détection)

`grep eslint|react-hooks package.json` → **0** ; aucun `.eslintrc*` / `eslint.
config.*`. **Aucun lint Rules of Hooks** dans le repo → la violation `/parametres`
n'a pas pu être attrapée à la compilation (l'erreur n'apparaît qu'au **runtime**,
au 2ᵉ rendu, donc invisible en test rapide où `isLoading` est déjà false au montage
si les données sont en cache).

### Recommandation (prévention, pas un blocker)

Ajouter **`eslint-plugin-react-hooks`** avec `react-hooks/rules-of-hooks: "error"`
(et `exhaustive-deps: "warn"`) au lint, idéalement en pré-commit / CI. Coût ~15 min,
empêche **toute** récurrence de cette classe de crash (qui rendait une page
entièrement inutilisable).

---

## Verdict

Le crash `/parametres` (React #310) était **l'unique** violation Rules of Hooks du
client — **corrigée et déployée**. Sweep complet → aucune autre. Seule réserve :
**absence d'ESLint react-hooks** (cause de la non-détection) → reco d'outillage.
**Pas de nouvelle issue Linear.**
