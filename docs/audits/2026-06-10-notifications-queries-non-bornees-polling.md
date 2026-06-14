# Audit — Notifications : requêtes non bornées en chemin chaud (count + liste) — MEDIUM

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> Périmètre : `getUnreadNotificationsCount` (`db.ts:845-853`),
> `getNotificationsByArtisanId` (`db.ts:838`), `notifications.list`
> (`routers.ts:2067-2084`), polling `NotificationBell` (`DashboardLayout.tsx:564`).

---

## Constat : « charger-tout-puis-compter/slice en JS » sur une entité qui s'accumule

Les notifications sont **auto-créées en masse** (paiement reçu, message client, alerte,
RDV…) → leur nombre **croît continûment** par tenant. Deux requêtes les traitent sans
borne SQL :

### 1) Badge non-lus pollé toutes les 30 s → `SELECT *` au lieu de `COUNT(*)`

```typescript
// db.ts:845 — getUnreadNotificationsCount
const result = await db.select().from(notifications)
  .where(and(eq(artisanId), eq(lu,false), eq(archived,false)));
return result.length;   // ⚠ charge TOUTES les lignes non-lues juste pour les compter
```

`NotificationBell` la **poll toutes les 30 s** (`DashboardLayout.tsx:564`,
`refetchInterval: 30000`) pour **chaque utilisateur connecté**. Un user qui ne lit pas ses
notifications → des centaines de lignes ramenées toutes les 30 s × tous les users actifs.

### 2) `notifications.list` : pagination **en JS** sur une query non bornée

```typescript
// routers.ts:2077-2084
const all = await db.getNotificationsByArtisanId(artisan.id, includeArchived); // pas de LIMIT
...
return filtered.slice((page-1)*limit, page*limit);   // ⚠ slice après avoir tout chargé
```

`getNotificationsByArtisanId` (`db.ts:838`) fait `SELECT … ORDER BY createdAt` **sans
`LIMIT`** → chaque ouverture de la cloche (ou page) charge **tout l'historique** de
notifications en mémoire Node pour n'en afficher que 10/50.

---

## Impact & cadrage

- **Au lancement** (tenants neufs, peu de notifications) : négligeable.
- **Dans le temps** : charge DB + mémoire Node **croissante** (polling continu + liste non
  bornée). Dégrade en douceur (latence/mémoire), **ne casse ni ne corrompt** rien.
- → **MEDIUM** (perf/scale), sous le seuil BLOCKER/HIGH.

C'est **exactement** l'anti-pattern que le **dashboard** a déjà corrigé (« Ancienne
implémentation : 4 SELECT ramenés en mémoire Node … → 8 agrégations SQL », `getDashboardStats`).
Les notifications ont été **oubliées** dans ce refacto. Même **classe perf** que le N+1 des
exports en lot (déjà documenté) → à rattacher, pas dupliquer.

---

## Reco (fix simple)

1. `getUnreadNotificationsCount` → `SELECT COUNT(*)` (`db.select({ c: sql\`COUNT(*)\` })`)
   au lieu de charger les lignes.
2. `getNotificationsByArtisanId` → accepter `limit`/`offset` et les **pousser en SQL**
   (`.limit().offset()`), filtrage `lu`/`archived` en `WHERE`. `notifications.list`
   transmet `input.limit/page` à la requête au lieu de `.slice()`.

---

## Verdict

Le badge non-lus (**pollé 30 s**) fait un `SELECT *`+`.length` et `notifications.list`
**charge tout puis slice en JS** → coût **croissant** avec l'accumulation des
notifications. Négligeable au lancement, **MEDIUM** à terme (perf), même classe que le
refacto SQL **déjà** appliqué au dashboard. **Pas de nouvelle issue Linear** ; fix simple
(`COUNT(*)` + `LIMIT` SQL) à planifier.
