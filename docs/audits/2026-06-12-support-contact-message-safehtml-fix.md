# Fix (MODE A) — `support.contact` : message échappé partiellement (manuel `[<>]`) → aligné sur `safeHtml`

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (cohérence d'échappement, pas une faille)

> `supportRouter.contact` (`server/routers.ts:9007`). Classe « échappement HTML emails »
> (même famille qu'OPE-12/36/59).

---

## Constat

Dans le body HTML de l'email support, `nom`/`email` sont échappés via **`safeHtml`** (`:9010`),
mais le **`message`** utilisait un échappement **manuel et partiel** :
```ts
${input.message.replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}
```
→ n'échappe que `<` et `>`, **pas `&`** (ni `"`/`'`). **Pas une faille XSS** (les balises sont
bloquées par l'échappement `<>`), mais **incohérent** avec le reste de la fonction et avec le
helper standard du codebase, et un `&` brut peut être interprété comme début d'entité.

## Fix appliqué (`server/routers.ts:9014`)

Remplacement par `${safeHtml(input.message)}` (échappe `& < > " '` + `\n → <br>`), comme pour
`nom`/`email` deux lignes au-dessus. Le `<br>` rend les sauts de ligne dans le `div`
`white-space:pre-wrap` (conservé) ; l'indentation parasite du template literal a été retirée
(rendu plus propre).

- **Behavior-preserving** : un message légitime (sauts de ligne, texte sans métacaractère) rend
  à l'identique ; seul l'échappement de `&`/`"` est désormais complet (defense-in-depth) et
  cohérent. Faible blast radius (un body d'email interne).

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « échappement HTML emails » → **rattachée à OPE-59** (sweep d'échappement). **Pas d'issue
Linear** ; documenté ici. Confirme par ailleurs (re-sweep) qu'aucune autre interpolation user de
body email n'est non échappée.
