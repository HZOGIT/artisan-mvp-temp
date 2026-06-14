# Audit — Emails lifecycle/marketing sans désinscription (List-Unsubscribe) — MEDIUM-LOW

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `sendEmail` (`emailService.ts`), templates lifecycle
> (`buildTrialEndingJ3/J1`, `buildDiscoveryJ3`) ; envois par le scheduler
> (`index.ts:1360-1442`).

---

## Constat : aucun mécanisme de désinscription

`grep unsubscribe|désinscri|se désabonner|List-Unsubscribe` sur `emailService.ts` = **0**.
`sendEmail` ne pose **aucun header** (que `from/replyTo/to/subject/html/attachments`) → pas
de **`List-Unsubscribe`** ; et **aucun lien** de désinscription dans les corps.

### Quels emails sont concernés

- **Transactionnels** (devis, facture, signature, reset mdp, paiement confirmé/échoué,
  résiliation) → **pas besoin** de désinscription. OK.
- **Lifecycle / engagement** (envoyés par le **scheduler** aux essais/prospects) :
  - `buildTrialEndingJ3Email` / `J1` (« plus que 3 jours / dernier jour ») — limite
    transactionnel.
  - **`buildDiscoveryJ3Email`** (« comment se passe votre découverte ? voici 3 choses à
    faire ») — **marketing/engagement** → devrait être désinscriptible.

### Pourquoi MEDIUM-LOW

- **Délivrabilité (Gmail/Yahoo 2024)** : les expéditeurs en volume doivent fournir
  **`List-Unsubscribe`** + `List-Unsubscribe-Post` (désinscription **1-clic**), sinon
  throttling/spam. Au lancement (faible volume) non bloquant, **mais croît** avec le
  volume.
- **Conformité** : ces emails vont à des users **inscrits** (compte créé, email fourni) —
  base légale OK, **pas du cold prospecting** → pas de blocage légal dur. Mais l'absence de
  désinscription sur l'email **découverte** (engagement) est une mauvaise pratique.
- → **MEDIUM-LOW**, sous le seuil BLOCKER/HIGH.

---

## Distinction (anti-doublon)

- **OPE-37** (« scheduler : emails ré-envoyés ~24×/jour → spam + délivrabilité ») = **même
  classe délivrabilité** mais via l'**idempotence** (re-send). Ici = **absence de
  désinscription / List-Unsubscribe**. Complémentaire → **à rattacher à OPE-37**, pas un
  doublon ni une issue séparée.

---

## Fix proposé

1. Ajouter les headers **`List-Unsubscribe`** (URL + `mailto:`) et
   **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`** dans `sendEmail` pour les
   emails **lifecycle/marketing** (drapeau `category` au payload Resend).
2. **Lien de désinscription** + endpoint qui pose un flag `emailsMarketingOptOut` sur
   l'artisan ; le scheduler **filtre** les opt-out avant l'envoi des emails non
   transactionnels.
3. Garder les **transactionnels** tels quels (pas de désinscription).

---

## Verdict

Les emails **lifecycle/marketing** (surtout **découverte J+3**) n'ont **ni lien de
désinscription ni `List-Unsubscribe`** → risque **délivrabilité** (Gmail/Yahoo) croissant +
mauvaise pratique d'engagement. Transactionnels OK. **MEDIUM-LOW**, classe **OPE-37**
(rattaché). **Pas de nouvelle issue Linear.**
