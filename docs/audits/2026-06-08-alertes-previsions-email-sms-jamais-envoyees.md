# Audit — Alertes prévisions CA : email/SMS jamais envoyés + aucun déclenchement automatique

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `alertesPrevisionsRouter` (`routers.ts:6951`),
> `verifierEcartsEtEnvoyerAlertes` (`db.ts:5573`), page `AlertesPrevisions.tsx`.
> Même classe « feature visible mais non fonctionnelle » qu'OPE-51 (modèles email)
> et OPE-27 (portabilité RGPD).

---

## Ce qui fonctionne correctement

- Routes scopées `artisan.id` (`getConfig`/`saveConfig`/`getHistorique`/
  `verifierEtEnvoyer`). Pas d'IDOR.
- **Anti-spam correct** : `verifierEcartsEtEnvoyerAlertes` n'enregistre qu'**une
  alerte par `(artisanId, mois, annee, typeAlerte)`** (garde `SELECT … LIMIT 1`
  avant insert, `db.ts:~5628`) → pas de boucle/spam même si la mutation est
  appelée en boucle.

---

## 🟠 HIGH (complétude) — Les alertes email/SMS configurées ne sont **jamais envoyées**

### Problème 1 — aucun envoi réel

La page `AlertesPrevisions.tsx` propose explicitement « **Recevoir les alertes par
email** » (`:190`) et « **Recevoir les alertes par SMS** » (`:213`) avec champs
`emailDestination` / `telephoneDestination`. Mais `verifierEcartsEtEnvoyerAlertes`
**calcule le canal puis se contente d'insérer une ligne d'historique** — **aucun**
`sendEmail` / envoi SMS :

```typescript
// db.ts:~5635 — calcule le canal mais n'envoie rien
const canal = config.alerteEmail && config.alerteSms ? "les_deux" : config.alerteEmail ? "email" : config.alerteSms ? "sms" : "email";
await dbi.insert(historiqueAlertesPrevisions).values({ /* ... canal ... */ });   // ← seul effet
return nouvellesAlertes;
```

`grep` d'un envoi rattaché aux alertes prévisions (`sendEmail`/SMS sur
`emailDestination`/`telephoneDestination`) → **0** (hors tests). Le commentaire du
helper le dit : « le canal d'envoi réel (email/sms) est externe à ce helper » — or
**ce canal externe n'existe pas**. L'artisan active « alertes par email/SMS », ne
reçoit **jamais rien**.

### Problème 2 — aucun déclenchement automatique

`grep verifierEcartsEtEnvoyerAlertes server/_core/index.ts` → **0** : le scheduler
**ne lance jamais** la vérification. Elle ne tourne qu'au **clic manuel** sur
`verifierEtEnvoyer`. Donc même l'alerte **in-app** (historique) n'est pas
proactive : sans action manuelle de l'artisan, aucun écart n'est jamais détecté.

### Impact

Feature « Alertes & Prévisions » **promise mais non livrée** : l'artisan croit être
prévenu (email/SMS) en cas d'écart de CA, mais (1) rien n'est envoyé et (2) rien ne
tourne automatiquement. Pas de sécurité/donnée en jeu — **complétude** (même nature
qu'OPE-51).

### Fix proposé

1. **Brancher l'envoi** après l'enregistrement de l'alerte : `sendEmail(emailDestination, …)`
   si `alerteEmail`, envoi SMS (Twilio) vers `telephoneDestination` si `alerteSms`.
2. **Déclencheur scheduler** : job quotidien parcourant les configs `actif=true` et
   appelant `verifierEcartsEtEnvoyerAlertes` (l'anti-spom mensuel existant évite les
   doublons).
3. **SMS** : Twilio étant absent des environnements (cf. OPE-15), soit masquer/
   désactiver le toggle SMS, soit documenter qu'il nécessite Twilio.

### Estimation

~0,5 j — câblage envoi email (+ SMS si Twilio) + job scheduler quotidien + test.

---

## Estimation totale

- HIGH (alertes email/SMS non envoyées + pas de trigger auto) : ~0,5 j
