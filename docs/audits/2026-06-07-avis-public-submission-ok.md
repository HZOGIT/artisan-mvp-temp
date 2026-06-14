# Audit — Soumission d'avis publique (token) + notifications in-app — OK

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : flow public d'avis client — `avis.submitAvis` (`routers.ts:5165`),
> `avis.getDemandeInfo` (`:5217`), envoi `demandeAvis` (`:5030`), exposition
> publique via `vitrine.getBySlug` (`:7464`). + vérification rapide du
> `notificationsRouter` in-app (`:2057`).

---

## Conclusion : aucun BLOCKER/HIGH. Les deux surfaces sont saines.

### Avis public (token) — robuste

- **Token sécurisé** : `tokenDemande = crypto.randomUUID()` (`routers.ts:5031`),
  **non devinable** → pas d'énumération des demandes/clients via `getDemandeInfo`.
- **Expiration appliquée** : 14 j (`expiresAt`), vérifiée dans `submitAvis`
  (`:5181`) **et** reflétée dans `getDemandeInfo` (`isExpired`).
- **Usage unique** : `submitAvis` refuse si `demande.statut === 'completee'`
  (`:5177`) et bascule la demande en `completee` après création → pas de
  multi-soumission avec le même token.
- **Note bornée** : `z.number().min(1).max(5)` (validation Zod).
- **Pas de stored-XSS sur la vitrine** : le `commentaire` (texte libre public) est
  renvoyé par `getBySlug` puis rendu en **JSX texte** par `Vitrine.tsx` (React
  échappe par défaut ; `grep dangerouslySetInnerHTML client/src` → présent
  uniquement dans `chart.tsx`/`Assistant.tsx`/`Home.tsx`, **pas** dans la vitrine).
- `getDemandeInfo` n'expose que des champs minimaux (`nomEntreprise`, `client.nom`,
  `intervention.titre`/date) — et uniquement à un porteur du token aléatoire.

### Notifications in-app (`notificationsRouter`) — correctement scopées

Toutes les mutations par id passent l'`artisanId` au helper pour forcer le
`WHERE artisanId` (commentaire explicite « SECURITE » `:2088`) :
`markAsRead(input.id, artisan.id)`, `archive(input.id, artisan.id)`,
`delete → archiveNotification(input.id, artisan.id)`. Lectures scopées
(`getNotificationsByArtisanId(artisan.id)`). **Pas d'IDOR.** (À distinguer de
`notificationsPushRouter`, lui déjà inventorié dans OPE-47.)

---

## Réserves (déjà tracées, pas d'issue ici)

- **Modération / transparence des avis** (auto-publication `statut:'publie'`,
  masquage qui gonfle la moyenne) → **déjà audité** dans
  `2026-06-07-avis-moderation-transparence.md` (HIGH dédié). Hors périmètre de ce
  run.
- **Pas de rate limit sur `submitAvis`** : impact négligeable car **single-use par
  token** (un token = un avis) ; pas de vecteur de flood exploitable.

---

## Verdict

Le flow d'avis public (token crypto + usage unique + expiry + rendu échappé) et
les notifications in-app (scoping `artisanId` systématique) sont **vérifiés
sains**. **Pas d'issue Linear créée.**
