# Audit — Notifications push : pipeline web-push entièrement absent (feature morte + promesse non tenue)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `notificationsPushRouter` (`routers.ts`), table `pushSubscriptions`,
> service worker `client/public/sw.js`, `DashboardLayout.tsx`. Même classe qu'OPE-51
> / OPE-70 (feature visible mais non fonctionnelle). Distinct d'OPE-31 (IDOR sur
> les routes de ce routeur).

---

## 🟠 HIGH (complétude) — Le web-push n'est branché nulle part, mais une promesse explicite est affichée

### Le pipeline complet est mort

- **Serveur** : `grep web-push|webpush|VAPID|sendNotification` → **0**. Pas de lib
  web-push, **pas de clés VAPID** (env.ts + .env → 0), **aucun code d'envoi**. Seul
  existe le **CRUD de stockage** des subscriptions (`savePushSubscription`,
  `db.ts:5445`) + le router (déjà dans OPE-31 pour l'IDOR).
- **Client** : `grep pushManager|subscribe(|applicationServerKey|savePushSubscription`
  sur `client/src` → **0**. Le navigateur ne **s'abonne jamais** au push ; le
  endpoint `savePushSubscription` n'est **jamais appelé**.
- **Service worker** (`sw.js`) : listeners `install`/`activate`/`fetch`
  uniquement — **aucun listener `push` ni `notificationclick`** → même si un push
  arrivait, le SW ne pourrait pas l'afficher.

→ La table `pushSubscriptions` reste **vide** (rien ne s'abonne) et **rien
n'envoie**. Infrastructure morte.

### …mais une promesse est faite à l'utilisateur

`DashboardLayout.tsx:929-934` demande la permission de notification puis affiche :

```typescript
new Notification("Operioz", {
  body: "Notifications activées ! Vous serez alerté des nouveaux devis et factures.",
});
```

→ L'utilisateur accorde la permission **sur la foi de cette promesse** (« Vous
serez alerté des nouveaux devis et factures ») et ne reçoit **jamais** aucune
alerte OS/arrière-plan ensuite. La seule notification émise est ce message de
confirmation, **une fois**.

### Atténuation

Les **notifications in-app** (la cloche, `notificationsRouter`) **fonctionnent**
(auditées OK) : l'utilisateur voit les nouveaux devis/factures **quand il est dans
l'app**. Le manquant = la notification **OS / arrière-plan** (l'intérêt même de
demander la permission + d'avoir un SW).

### Fix proposé (au choix)

- **Honnête / rapide** : retirer la promesse trompeuse (« Vous serez alerté… ») et
  ne pas demander la permission de notification tant que le push n'est pas livré ;
  garder seulement la cloche in-app.
- **Complet** : implémenter le web-push de bout en bout — clés VAPID (env) + lib
  `web-push` serveur + `pushManager.subscribe(applicationServerKey)` client (→
  `savePushSubscription`) + listener `push`/`notificationclick` dans `sw.js` +
  envoi serveur à la création de devis/facture (là où `notificationsRouter` crée
  déjà la notif in-app).

### Estimation

~15 min (retrait promesse) **ou** ~1,5 j (implémentation web-push complète).

---

## Estimation totale

- HIGH (feature push promise non tenue) : ~15 min (honnêteté) / ~1,5 j (complet)
