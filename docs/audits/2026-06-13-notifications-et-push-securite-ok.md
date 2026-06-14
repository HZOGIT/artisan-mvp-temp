# Audit — Notifications (in-app) + Push (web push techniciens) : sécurité ✅ OK (aucun BLOCKER)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : Notifications in-app (`notifications`) + abonnements **Web Push** des techniciens (`push_subscriptions`, `preferences_notifications`, historique).

> Cibles de BLOCKER : **IDOR cross-tenant** (lire/marquer/supprimer la notification d'un autre artisan ; détourner le push d'un technicien d'un autre tenant — « push hijack »), **mass-assignment**, **DoS** (pagination non bornée), **XSS/redirection** via `message`/`lien`.

---

## ✅ Notifications in-app — scoping tenant strict

| Endpoint (`routers.ts`) | Garde | Helper DB | Verdict |
|---|---|---|---|
| `list` (`:2512`) | `getArtisanByUserId` | `getNotificationsByArtisanId(artisanId, …)` → `WHERE artisanId=?` (`db.ts`) + pagination SQL | ✓ |
| `getUnreadCount` (`:2534`) | idem | `getUnreadNotificationsCount(artisanId)` | ✓ |
| `markAsRead` (`:2540`) | passe `artisan.id` | `markNotificationAsRead(id, artisanId)` → **`WHERE id=? AND artisanId=?`** | ✓ pas d'IDOR |
| `markAllAsRead` (`:2550`) | `artisan.id` | `markAllNotificationsAsRead(artisanId)` | ✓ |
| `archive` (`:2559`) / `delete` (`:2569`) | `artisan.id` | `archiveNotification(id, artisanId)` → **`WHERE id=? AND artisanId=?`** (soft-delete = `archived=true`, pas de hard-delete) | ✓ |

→ **Aucun IDOR** : tous les mutateurs scopent par `(id, artisanId)`. Le `delete` **archive** (pas de suppression dure) → pas de perte de données. Pagination **bornée** (`page ≤ 100000`, `limit ≤ 100`, OPE-24) → pas de DoS par OFFSET géant.

## ✅ Push (web push techniciens) — OPE-31, ownership systématique

`assertTechnicienOwnership(technicienId, userId)` (`routers.ts:6835`) vérifie **`tech.artisanId === artisan.id`** (les helpers DB ne scopent que par `technicienId` ; cette garde empêche de cibler un technicien d'un autre tenant) :

| Endpoint | Garde | Verdict |
|---|---|---|
| `subscribe` (`:6846`) | `assertTechnicienOwnership` avant `savePushSubscription` ; input à **forme fixe** (endpoint/p256dh/auth/userAgent) → pas de mass-assignment | ✓ |
| `unsubscribe` (`:6859`) | **résout endpoint → technicienId** puis `assertTechnicienOwner` (OPE-31) → on ne désactive pas l'abonnement d'un autre tenant par devinette d'`endpoint` | ✓ |
| `getPreferences`/`savePreferences` (`:6871`/`:6878`) | `assertTechnicienOwnership` | ✓ |
| `getHistorique` (`:6895`) | `assertTechnicienOwnership` + `limit ≤ 500` | ✓ |
| `markAsRead` historique (`:6902`) | ownership (OPE-31) | ✓ |

→ Pas de **push hijack** ni de lecture d'historique/préférences cross-tenant. L'`endpoint` Web Push est cryptographiquement unique par appareil (non forgeable).

## ✅ Contenu des notifications — pas d'injection

- `lien` est **toujours posé serveur** (chemins internes `/factures/:id`, `/devis/:id`…) — jamais d'URL fournie par un tiers → pas d'open-redirect.
- `titre`/`message` sont construits serveur depuis des données du tenant (n° facture, nom client). Rendus côté React (échappement par défaut) → pas de XSS stocké via le nom client.
- Les générateurs internes (`generateOverdueReminders` `:2580`, rappels interventions) créent des notifications **pour l'artisan appelant uniquement** (`artisanId: artisan.id`).

## Odoo 19

`mail.notification` / `mail.message` sont rattachés à l'utilisateur/partenaire destinataire avec des règles d'accès (`ir.rule`) par société ; un utilisateur ne lit/acquitte que ses notifications. Operioz atteint l'équivalent par le scoping applicatif `artisanId` (notifications) et `technicienId`→tenant (push).

---

## Verdict

Les domaines **notifications in-app** et **push techniciens** sont **sains pour le lancement** : **tout** mutateur de notification scope par `(id, artisanId)` (pas d'IDOR), le `delete` est un **soft-delete**, la pagination est **bornée** (OPE-24), et **tous** les endpoints push vérifient l'**ownership du technicien** (OPE-31 — pas de push hijack ni de fuite préférences/historique). `lien`/`message` sont posés serveur (pas d'open-redirect/XSS). **Aucun BLOCKER/HIGH → pas d'issue Linear.**
