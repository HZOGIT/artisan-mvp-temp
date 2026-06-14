# Audit — Migration de démarrage `fix-duplicates.ts` : seeding démo hardcodé sur id=1

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `server/_core/fix-duplicates.ts`, exécutée **à chaque démarrage**
> (`fixDuplicates()` au chargement du module, `:1520`, sans aucun garde
> d'environnement).

---

## 🔴 BLOCKER — Le seeding « démo (id=1) » corrompt le compte du premier client réel en production, à chaque démarrage

`fix-duplicates.ts` contient des blocs de seeding **codés en dur sur l'artisan
`id = 1`**, écrits en supposant que `id=1` est toujours le compte démo/dev. En
**production**, `id=1` est le **premier artisan qui s'inscrit** (un vrai client).
Ces blocs s'exécutent **à chaque boot**, sans garde `NODE_ENV`.

### Bloc plan/onboarding/notifications — TOTALEMENT inconditionnel (`:1030-1065`)

```typescript
// fix-duplicates.ts:1031
await pool.execute("UPDATE artisans SET plan = 'entreprise' WHERE id = 1");
// :1040 — active TOUS les modules pour l'artisan 1
INSERT INTO artisan_modules (artisan_id, module_slug, actif) SELECT 1, slug, TRUE FROM modules ON DUPLICATE KEY UPDATE actif = TRUE
// :1050
await pool.execute("UPDATE artisans SET onboarding_completed = TRUE WHERE id = 1");
// :1058
await pool.execute("UPDATE notifications SET lu = TRUE WHERE artisanId = 1 AND lu = FALSE");
```

→ À chaque démarrage, le premier client réel (id=1) se voit :
- **forcé en plan `entreprise`** (fonctionnalités premium gratuites + incohérence
  avec son abonnement Stripe réel — cf. OPE-43) ;
- **tous les modules activés** ;
- **onboarding marqué terminé** (saute son vrai onboarding) ;
- **toutes ses notifications marquées lues** (il perd ses notifications non lues
  à chaque déploiement).

### Bloc vitrine — semi-conditionnel (`:555-570`)

```typescript
const [pa] = await pool.execute('SELECT vitrineActive FROM parametres_artisan WHERE artisanId = 1');
if (pa.length > 0 && !pa[0].vitrineActive) {
  await pool.execute(`UPDATE parametres_artisan SET vitrineActive = TRUE,
    vitrineDescription = ?, vitrineZone = ?, vitrineServices = ?, vitrineExperience = ? WHERE artisanId = 1`,
    ['Entreprise spécialisée en plomberie...', 'Paris et Île-de-France', servicesPlomberie, ...]);
}
```

→ Si l'artisan #1 (ex. un électricien à Lyon) n'a pas encore activé sa vitrine,
le système lui **publie automatiquement une page vitrine publique de plombier
parisien** sous son compte.

### Impact

**Corruption silencieuse des données du premier client en production**, répétée
à chaque redémarrage/déploiement : abonnement faussé (entreprise gratuit),
vitrine publique falsifiée, notifications effacées, onboarding sauté. Aucun garde
d'environnement (`grep NODE_ENV` dans les blocs → absent ; `fixDuplicates()`
tourne inconditionnellement à `:1520`).

### Cause racine

L'hypothèse « `id = 1` = compte démo » est **fausse en base partagée de prod**.
Les blocs de seed démo n'ont aucune condition les restreignant au dev.

### Fix proposé

1. **Garder tout le seeding démo derrière `NODE_ENV !== 'production'`** (ou une
   variable explicite `SEED_DEMO=1`), OU le retirer du chemin de démarrage prod.
2. Ne **jamais** cibler un artisan par `id` codé en dur. Si un compte démo est
   nécessaire en prod, l'identifier par un critère stable (email `dev@operioz.com`),
   pas par `id=1`.
3. En particulier, **ne jamais forcer `plan`** depuis une migration : le plan doit
   venir de l'abonnement Stripe (cf. OPE-28 / OPE-43).

### Estimation

~1 h — garde d'environnement + suppression des `WHERE id = 1` codés en dur + test
sur DB avec id=1 = vrai compte.

---

## Points secondaires (documentés, < BLOCKER)

- **`UPDATE users SET role='admin' WHERE role='user'`** (`:623`) : promeut tout
  user au rôle legacy `user` en **`admin`** (superadmin plateforme, bypass de
  toutes les permissions). Probablement legacy/no-op aujourd'hui, mais
  dangereux : une migration ne devrait jamais élever silencieusement des
  privilèges. À supprimer une fois la migration legacy passée.
- **Exécution inconditionnelle au boot** d'un routine de ~1500 lignes faisant des
  `ALTER`/`DROP COLUMN`/`DELETE`/dedup à chaque démarrage : risqué et coûteux. À
  terme, basculer ces correctifs ponctuels vers des **migrations Drizzle
  versionnées** (jouées une fois) plutôt qu'un script idempotent rejoué à chaque
  boot.

---

## Estimation totale

- BLOCKER (seeding démo id=1 en prod) : ~1 h
