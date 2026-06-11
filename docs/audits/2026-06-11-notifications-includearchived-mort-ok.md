# Audit — Notifications : paramètre `includeArchived` mort, pas de blocker

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `notifications.list` (`routers.ts:2077`) + `getNotificationsByArtisanId` (`db.ts:846`).

---

## Conclusion : cloisonnement OK. Bug fonctionnel LOW-MEDIUM (toggle archivées mort). Pas de BLOCKER/HIGH.

### Cloisonnement correct

`notifications.list` résout `artisan = getArtisanByUserId(ctx.user.id)` puis appelle
`getNotificationsByArtisanId(artisan.id, …)`. La requête filtre toujours
`eq(notifications.artisanId, artisanId)` → pas d'IDOR, pas de fuite cross-tenant.

### 🟡 Bug fonctionnel LOW-MEDIUM : `includeArchived` ignoré

`db.ts:846` —
```ts
getNotificationsByArtisanId(artisanId: number): Promise<Notification[]>
  // …where(and(eq(notifications.artisanId, artisanId), eq(notifications.archived, false)))
```
La fonction prend **un seul paramètre** et filtre **toujours** `archived = false`.

`routers.ts:2077` —
```ts
const all = await db.getNotificationsByArtisanId(artisan.id, input?.includeArchived || false);
```
Le caller passe un **2ᵉ argument** (`includeArchived`) que la signature **n'accepte pas**
→ silencieusement ignoré (TS ne crashe pas car arité non vérifiée à l'appel ici / build
esbuild non typé). Résultat : le toggle « voir les archivées » du front **n'a aucun effet**,
les notifications archivées ne sont **jamais** renvoyées.

**Sévérité** : LOW-MEDIUM. Feature secondaire (consultation d'archives de notifications),
aucune conséquence sécurité/finance/données. Dégradation UX d'une vue rarement utilisée.

**Fix** (additif, sûr) :
```ts
getNotificationsByArtisanId(artisanId: number, includeArchived = false) {
  const conds = [eq(notifications.artisanId, artisanId)];
  if (!includeArchived) conds.push(eq(notifications.archived, false));
  return db.select().from(notifications).where(and(...conds))…;
}
```

---

## Verdict

Pas d'IDOR, pas de BLOCKER/HIGH. Le paramètre `includeArchived` est **mort** → la vue
archivées est cassée (LOW-MEDIUM, feature secondaire). Fix additif trivial documenté
ci-dessus. **Pas de nouvelle issue Linear** (sous le seuil HIGH ; candidat auto-fix safe).
