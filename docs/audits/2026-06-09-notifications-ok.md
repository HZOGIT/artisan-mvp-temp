# Audit — Notifications (CRUD + génération) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `notificationsRouter` (`routers.ts:2057-2160`) — `list`, `getUnreadCount`,
> `markAsRead`, `markAllAsRead`, `archive`, `delete`, `generateOverdueReminders`,
> `generateUpcomingReminders` ; helpers DB (`db.ts:838-895`).

---

## Conclusion : module entièrement scopé tenant. Pas de BLOCKER/HIGH.

### Multi-tenant correct (aucun IDOR)

- **Lecture** : `getNotificationsByArtisanId` (`db.ts:838`) et `getUnreadNotificationsCount`
  (`:845`) filtrent `eq(notifications.artisanId, artisanId)`. `list`/`getUnreadCount`
  scopent `artisan.id`.
- **Écriture par id** : `markAsRead` (`:2099`), `archive` (`:2118`), `delete` (`:2128`)
  passent tous `artisan.id` au helper, et `markNotificationAsRead`/`archiveNotification`
  ajoutent alors `and(eq(id), eq(artisanId))` → `WHERE id=? AND artisanId=?`.
- **Vérifié** : `grep` de tous les appelants de `markNotificationAsRead`/
  `archiveNotification` → **3 appels, tous avec `artisan.id`** ; aucun endpoint public,
  aucun appelant n'omet l'artisanId.
- `markAllNotificationsAsRead` (`:878`) scopé `artisanId`.
- `generateOverdueReminders`/`generateUpcomingReminders` créent des notifications
  **in-app pour l'artisan** scopées `artisan.id` (pas d'envoi externe, pas de
  cross-tenant).

→ Impossible de lire/marquer/archiver/supprimer les notifications d'un autre tenant.

---

## Réserve mineure (défense en profondeur, pas d'issue)

`markNotificationAsRead(id, artisanId?)` et `archiveNotification(id, artisanId?)`
(`db.ts:870/883`) ont l'`artisanId` **optionnel** : sans lui, le `WHERE` se réduit à
`eq(id)` (cross-tenant). Tous les appelants actuels le passent, mais c'est un **footgun
latent** — un futur appelant qui l'omettrait introduirait un IDOR. Reco : rendre
`artisanId: number` **obligatoire** dans la signature. Coût ~2 min.

---

## Anti-doublon

Aucune issue existante sur le module notifications ; aucun finding bloquant ici →
**pas d'issue Linear**.

---

## Verdict

Notifications : **scopé tenant à chaque site d'appel** (lecture + écriture), pas d'IDOR,
générateurs de rappels in-app scopés artisan. Seule réserve : rendre l'`artisanId`
obligatoire dans les 2 helpers (footgun latent). **Pas d'issue Linear.**
