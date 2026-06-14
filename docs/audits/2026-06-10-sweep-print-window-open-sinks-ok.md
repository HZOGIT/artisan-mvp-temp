# Audit — Sweep des sinks `document.write` / `window.open` clients (autres que OPE-87) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : toutes les occurrences `document.write` / `printWindow` / `window.open` /
> `window.location.href` du client, pour détecter d'éventuelles **instances sœurs** du XSS
> d'impression OPE-87.

---

## Conclusion : un seul sink dangereux (OPE-87), les autres sont sûrs. Pas de BLOCKER/HIGH nouveau.

`grep document.write|printWindow|window.open` → 3 fichiers :

### 1) `CalendrierChantiers.tsx` — **dangereux → déjà filé OPE-87**

`printWindow.document.write` de noms tenant **non échappés** → XSS stocké à l'impression
(escalade collaborateur→owner). **Issue OPE-87 créée** (run précédent).

### 2) `ExpiredBlocker.tsx` — navigation sûre

- `:29` `window.location.href = res.url` → `res.url` = URL **Stripe générée côté serveur**
  (createPortal/createCheckout), **non contrôlée par l'utilisateur** → navigation
  intentionnelle, pas d'injection.
- `:81` `window.open("mailto:contact@operioz.com")` → **mailto statique**. Safe.
- `:38` `window.location.reload()`. Safe.

### 3) `InterventionsMobile.tsx` — navigation sûre

- `:91-93` `window.open("https://www.google.com/maps/search/?…query=${encodedAddress}")` :
  `encodedAddress = encodeURIComponent(adresse)` (`:91`) + **host Google fixe** → pas
  d'injection, pas d'open-redirect (URL externe assumée vers Maps).
- `:97` `window.location.href = \`tel:${telephone}\`` → schéma **`tel:`** → aucune
  exécution JS (un `tel:` malformé est inerte). Safe.

→ **Aucune autre injection HTML** ni open-redirect : les `window.open`/`location.href`
restants ciblent des **URL serveur de confiance** (Stripe), des **schémas inertes**
(`mailto:`/`tel:`) ou un **host externe fixe** (Google Maps) avec entrée **encodée**.

---

## Verdict

Le pattern dangereux (`document.write` de données non échappées) est **isolé à
`CalendrierChantiers`** (OPE-87) — **pas d'instance sœur**. Les autres `window.open`/
`location.href` du client sont de la **navigation sûre** (URL serveur, `mailto:`/`tel:`,
Maps encodé). **Pas de nouvelle issue Linear.**
