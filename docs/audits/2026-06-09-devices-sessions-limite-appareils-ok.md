# Audit — Gestion des appareils / sessions (devices router + limite d'appareils) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `devicesRouter` (`routers.ts:8327` — `list`/`revoke`/`revokeAll`),
> enregistrement + limite d'appareils et sessions dans `subscriptionGuard`
> (`subscriptionGuard.ts:124-177`), fonctions DB (`db.ts:3760-3851`,
> `registerDevice`/`getDevices`/`getDevice`/`deleteDevice`/`deleteOtherDevices`),
> `generateFingerprint` (`deviceUtils.ts`).

---

## Conclusion : isolation correcte, aucun IDOR. Pas de BLOCKER/HIGH nouveau.

### Multi-tenant / multi-utilisateur correct (aucun IDOR)

- `list` → `getDevices(ctx.user.id)` : `SELECT … WHERE user_id = ?` → uniquement ses
  propres appareils.
- `revoke(deviceId)` → `deleteDevice(deviceId, ctx.user.id)` :
  `DELETE … WHERE id = ? AND user_id = ?` → passer le `deviceId` **d'un autre
  utilisateur = no-op** (0 ligne supprimée), pas de suppression cross-compte.
- `revokeAll` → `deleteOtherDevices(ctx.user.id, currentFp)` scopé `user_id`.
- `registerDevice` / `getDevice` / `countActiveDevices` : tous filtrés `user_id = ?`.

→ La table `devices` est systématiquement cloisonnée par `user_id`. Pas de fuite ni
d'altération cross-tenant.

### Garde appareils/sessions fonctionnel

- Nouvel appareil à la limite → `403 device_limit_reached` (la vérif tourne **même** en
  `writeFresh`, cf. `subscriptionGuard.ts:131`).
- Sessions simultanées → éviction LRU (`deleteOldestSession`) avant `createSession`.

---

## Réserves (MEDIUM — non bloquantes, pas d'issue Linear)

1. **Fingerprint volontairement grossier = `SHA1(os|browser|deviceType)`**
   (`deviceUtils.ts:46-51`). L'espace total est ~5 OS × 6 navigateurs × 3 types ≈ **90
   empreintes possibles au monde**. Conséquences :
   - La « limite de 3 appareils » est en réalité une **limite de 3 combinaisons
     OS/navigateur/type**, pas de 3 machines physiques. N+ employés tous sur
     Chrome/Windows/desktop = **1 seule empreinte** → partage de compte illimité sous un
     même UA. *Recouvre le même angle « revenu » que la limite de sièges `maxUsers` non
     appliquée (déjà filée — invite-maxusers).* Pas de nouvelle issue.
   - Inversement, **risque de lock-out légitime** : un utilisateur seul sur
     desktop-Chrome + phone-Safari + tablet-Safari = 3 empreintes = à la limite ;
     ouvrir Firefox sur le desktop ⇒ `403`. Mitigé par l'auto-révocation dans le profil
     et par la grossièreté même de l'empreinte (la plupart des users ont 1–2
     combinaisons) → probabilité faible. À surveiller post-lancement.

2. **L'éviction LRU de session n'invalide pas le JWT** (stateless, valable 7 j) : couper
   la ligne `sessions` ne déconnecte pas réellement l'appareil. C'est exactement le
   périmètre de **« Sessions JWT non révocables »** (déjà filée). Pas de doublon.

3. `registerDevice` est **fail-open** (`catch` → log + continue) : un échec
   d'enregistrement ne bloque jamais la requête → la limite peut être ponctuellement non
   appliquée sous erreur DB. Cohérent avec la « règle d'or » défensive du guard ; footgun
   mineur, non bloquant.

---

## Verdict

Gestion des appareils/sessions : **cloisonnée par `user_id`** (lecture, révocation,
révocation-globale), **pas d'IDOR**, garde de limite fonctionnel. Les faiblesses sont de
nature **revenu/UX (MEDIUM)** et **recouvrent des issues déjà ouvertes** (sièges
`maxUsers`, JWT non révocables). **Pas de nouvelle issue Linear.**
