# Audit — `getOrCreateArtisan` / `getArtisanByUserId` : résolution du tenant (collaborateurs) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `getArtisanByUserId` + `getOrCreateArtisan` (`server/db.ts`) — fondation de
> la résolution multi-tenant utilisée par toutes les procédures.

---

## Conclusion : collaborateurs résolus vers le parent, pas de split de tenant. Pas de BLOCKER/HIGH.

Risque cherché : un **collaborateur** (technicien/secrétaire) appelant une mutation qui
utilise `getOrCreateArtisan` se verrait créer un **nouvel artisan** (devenant son propre
tenant → données orphelines / split d'entreprise) au lieu de résoudre l'artisan parent.

### `getArtisanByUserId` résout le collaborateur via `users.artisanId`

```typescript
// db.ts
const userResult = … select artisanId from users where id = userId;
if (userResult[0]?.artisanId) {                       // collaborateur lié
  return artisans where id = userResult[0].artisanId; // → ARTISAN PARENT
}
return artisans where userId = userId;                // fallback : owner direct
```

→ Un collaborateur (dont `users.artisanId` pointe vers l'entreprise) obtient **l'artisan
parent**. Cohérent avec OPE-54 (« getArtisanByUserId résout les collaborateurs »).

### `getOrCreateArtisan` ne crée **pas** pour un collaborateur

```typescript
const existing = await getArtisanByUserId(userId);
if (existing) return existing;        // collaborateur → parent trouvé → RETOUR, pas de create
return await createArtisan({ userId, … });  // seulement si AUCUN artisan résolu
```

→ Pour un collaborateur, `existing` = parent ⇒ **retour immédiat**, **aucune** création.
La création n'a lieu que pour un user **sans artisan résolu** (= owner pas encore
provisionné), ce qui est le cas voulu. Gestion `ER_DUP_ENTRY` (race) → refetch. Robuste.

---

## Réserve LOW

- **Edge-case data-integrity** : si un collaborateur avait `users.artisanId = NULL`
  (lien cassé — ne devrait pas arriver, l'invite/bootstrap le posent), `getArtisanByUserId`
  retomberait sur le fallback owner (pas de match) → `getOrCreateArtisan` **créerait** un
  artisan pour lui (split). Dépend d'une donnée incohérente, pas d'un bug de code.
  Durcissement : ne `create` que si le user n'est pas un collaborateur (rôle/absence de
  lien intentionnelle).

---

## Verdict

La résolution du tenant est **correcte** : `getArtisanByUserId` mappe les collaborateurs
vers l'**artisan parent** (via `users.artisanId`), et `getOrCreateArtisan` **ne crée
jamais** de doublon pour eux (retour de l'existant). Pas de split de tenant. **Pas de
nouvelle issue Linear.**
