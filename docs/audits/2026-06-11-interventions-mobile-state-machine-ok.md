# Audit — Interventions mobile `start`/`end` : ownership OK, machine à états laxe — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `interventionsMobile.startIntervention` (`routers.ts:4550`),
> `endIntervention` (`:4591`).

---

## Conclusion : cloisonnement correct, transitions non gardées (LOW). Pas de BLOCKER/HIGH.

### Ownership vérifié (pas d'IDOR)

Les deux mutations : `intervention.artisanId !== artisan.id → FORBIDDEN` (`:4562`, `:4603`)
→ un collaborateur ne peut start/end que les interventions de **son** tenant. Données
mobiles créées scopées (`artisanId: artisan.id`).

### 🟡 LOW — pas de garde de transition d'état

- `startIntervention` pose `statut='en_cours'` **sans vérifier l'état courant** → on peut
  « démarrer » une intervention **déjà terminée** ou **déjà en cours** → `heureArrivee`
  **réécrite** (perte de l'heure d'arrivée d'origine).
- `endIntervention` pose `statut='terminee'` **sans vérifier** qu'elle a été démarrée → une
  intervention peut passer **directement** à `terminee` **sans** `heureArrivee` (le
  `if (mobileData)` ne crée rien si start n'a jamais eu lieu) → `heureDepart` sans
  `heureArrivee` → **durée incohérente/nulle** si calculée depuis l'écart.

**Impact = LOW** : pas de corruption de données financières ni de faille ; au pire une
**durée d'intervention** fausse sur un flux malformé. Le flux normal (start→end) est
**imposé par l'UI mobile**. À durcir côté serveur si la durée alimente paie/facturation.

Reco : gardes simples — `start` n'agit que si `statut ∈ {planifiee}` ; `end` que si
`statut == 'en_cours'`.

---

## Verdict

`start`/`endIntervention` sont **ownership-checkés** (pas d'IDOR) ; il manque des **gardes
de transition d'état** (end-sans-start, re-start) → robustesse **LOW** (durée potentiellement
incohérente, UI-enforced en pratique, pas de sécurité/finance). **Pas de nouvelle issue
Linear.**
