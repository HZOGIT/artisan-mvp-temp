# Audit — Scheduler d'emails automatiques (idempotence)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : le scheduler horaire `runScheduler` (`server/_core/index.ts:1313`)
> qui envoie automatiquement des emails (fin d'essai J-3 / J-1, découverte J+3).

---

## Ce qui fonctionne correctement

- Bascule des trials expirés en `plan='expired'` **avant** les envois, pour
  éviter d'envoyer un J-3 à un trial déjà à 0 (`index.ts:1326`). ✓
- Section **dépenses récurrentes** (`index.ts:1430`) : explicitement **idempotente**
  — l'`UPDATE prochaine_occurrence` empêche les doublons même si le scheduler
  tourne plusieurs fois le même jour. ✓ (Preuve que l'équipe a conscience des
  exécutions multiples par jour.)
- Best-effort : chaque section est en try/catch, une erreur ne crashe pas le
  process.

---

## 🟠 HIGH — Emails de fin d'essai / découverte ré-envoyés ~24×/jour (pas d'idempotence)

### Problème

Le scheduler tourne **toutes les heures** :
```typescript
// index.ts:1511-1512
setTimeout(runScheduler, 60_000);
setInterval(runScheduler, 60 * 60 * 1000);   // ← horaire
```

Les emails J-3, J-1 et découverte J+3 sélectionnent les destinataires par
**jour calendaire** (`DATE() = DATE()`), sans aucune trace d'envoi :

```sql
-- index.ts:1352 (J-3) / 1379 (J-1)
WHERE s.status = 'trialing'
  AND DATE(s.trial_ends_at) = DATE(DATE_ADD(NOW(), INTERVAL 3 DAY))
-- index.ts:1407 (découverte J+3)
WHERE DATE(u.createdAt) = DATE(DATE_SUB(NOW(), INTERVAL 3 DAY))
```

Cette condition est vraie **toute la journée** → elle matche le même artisan à
**chacune des ~24 exécutions horaires** du jour. Et il n'existe **aucun garde-fou
d'idempotence** : pas de flag `j3_sent`, pas de table de log d'emails envoyés
(`grep j3_sent|email_log|lastEmailSent` → 0 résultat), et aucun `INSERT IGNORE`
après envoi (contrairement à la section dépenses récurrentes).

Résultat : chaque artisan dont l'essai se termine dans exactement 3 jours reçoit
**~24 emails « votre essai se termine dans 3 jours »** dans la même journée
(idem J-1, idem découverte J+3).

### Impact

1. **Spam des prospects** au pire moment (juste avant conversion) → agace et fait
   fuir les comptes en fin d'essai.
2. **Réputation du domaine expéditeur dégradée** : envoyer 24× le même email en
   masse fait flaguer le compte Resend → **chute de délivrabilité de TOUS les
   emails transactionnels**, y compris les **factures/devis envoyés aux clients**
   (fonction cœur). C'est le risque systémique le plus grave.
3. Burn du quota / coûts Resend.

> Distinct d'OPE-29 (idempotence du webhook Stripe) : autre mécanisme (scheduler
> horaire) et autre emplacement, mais même classe de défaut (effet de bord non
> idempotent).

### Fix proposé

Table de déduplication simple, vérifiée avant chaque envoi :
```sql
CREATE TABLE emails_automatiques_envoyes (
  artisan_id INT NOT NULL,
  type VARCHAR(32) NOT NULL,      -- 'trial_j3' | 'trial_j1' | 'discovery_j3'
  jour DATE NOT NULL,
  PRIMARY KEY (artisan_id, type, jour)
);
```
Avant l'envoi : `INSERT IGNORE` ; si `affectedRows === 0` → déjà envoyé, skip.
(Alternative : colonnes `trialJ3SentAt` / `trialJ1SentAt` sur `subscriptions` et
`discoveryJ3SentAt` sur `users`, ajoutées à la clause `WHERE` et positionnées
après envoi.)

### Estimation

~1,5 h — table/colonnes + garde `INSERT IGNORE` sur les 3 sections + test
multi-run.

---

## Estimation totale

- HIGH (idempotence des emails automatiques) : ~1,5 h
