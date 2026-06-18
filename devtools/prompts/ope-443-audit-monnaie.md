# OPE-443 — Audit : manipulation des montants monétaires

## Mission

Auditer toutes les pratiques de manipulation de montants monétaires dans `src/` et produire un rapport structuré par sévérité directement en commentaire Linear sur OPE-443.

Linear : https://linear.app/operioz/issue/OPE-443

## Périmètre exact

### 1. Schéma Drizzle (`src/**/infra/**/*.ts` + `src/shared/infra/db/schema/`)
- Colonnes de montant (`montant`, `total`, `prix`, `amount`, `price`, `taux`, `remise`, `tva`, etc.) : type `decimal`/`numeric` vs `real`/`float` vs `integer`
- Les montants Stripe stockés (centimes) : `integer` ?

### 2. Unités Stripe (`src/modules/paiement/`, `src/modules/subscription/`)
- Conversion euros → centimes (`* 100`) avant envoi à Stripe
- Reconversion centimes → euros à la lecture des webhooks / sessions
- Les `amount` envoyés sont-ils toujours des entiers (pas de `.5` ni `.3333`) ?

### 3. Calculs intermédiaires (toute la couche `application/`)
- `Math.round`, `toFixed`, `parseFloat` appliqués à des montants → chercher avec grep
- Calculs TVA, remises, totaux : additions/multiplications sur floats JS ?
- Comparaisons de montants (`===`, `>` sur floats) ?

### 4. Sérialisation tRPC / superjson
- Les montants traversent-ils le fil tRPC comme `number` JS ou `string`/`Decimal` ?
- Les schémas Zod des routers valident-ils les types monétaires (`z.number()` → ok ou pas ?)

### 5. Affichage (`client/src/`)
- `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })` vs `toFixed(2) + ' €'`
- Cohérence locale partout dans l'UI

## Méthode

1. **grep large** pour trouver tous les sites à risque :
   ```bash
   grep -rn "toFixed\|parseFloat\|Math\.round\|Math\.floor\|\* 100\|/ 100\|\.prix\|\.montant\|\.amount\|\.total" src/ --include="*.ts" | grep -v ".test.ts"
   grep -rn "real\(\|doublePrecision\|float(" src/ --include="*.ts"
   grep -rn "Intl\.NumberFormat\|toFixed.*€\|currency" client/src/ --include="*.tsx" --include="*.ts"
   ```
2. **Lire les fichiers** signalés pour confirmer le contexte (pas de faux positifs)
3. **Classifier** chaque finding : P0 (bug actif probable), P1 (risque arrondi), P2 (style/cohérence)
4. **Poster le rapport** en commentaire Linear sur OPE-443 via le MCP Linear (`save_comment`)

## Format du rapport (commentaire Linear)

```
## Audit montants monétaires — 2026-06-17

### P0 — Bugs actifs potentiels
- `src/...` ligne X : [description]

### P1 — Risques d'arrondi
- ...

### P2 — Cohérence / style
- ...

### ✅ Patterns corrects déjà en place
- ...

### Recommandation
[utilitaire money.ts centralisé ? règle ESLint no-float-money ?]
```

Puis passer OPE-443 en Done.
