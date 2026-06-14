# Audit — Avis : `envoyerDemande` (envoi de demande d'avis) — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `avis.envoyerDemande` (`routers.ts:5021-5072`), `envoyerDemandeParClient`
> (`:5075+`).

---

## Conclusion : ownership vérifié. Pas de BLOCKER/HIGH.

### Pas de FK-injection

`intervention = getInterventionById(input.interventionId)` →
`if (!intervention || intervention.artisanId !== artisan.id) → NOT_FOUND` (`:5030`). Le
`client` est dérivé de l'**intervention scopée** (`getClientById(intervention.clientId)`).
Token `crypto.randomUUID()` (fort), expiry 14 j ; `createDemandeAvis({ artisanId:
artisan.id, … })` scopé. → impossible d'émettre une demande d'avis liée à l'intervention/
client d'un **autre tenant**.

---

## Réserves LOW

1. **`client.nom` non échappé** dans le body de l'email (`:5062` `<h2>Bonjour
   ${client.nom}`) → injection HTML (artisan-controlled → self-XSS de son client). **Même
   classe qu'OPE-59** mais **point additionnel** non listé dans le sweep → ajouté en
   commentaire d'OPE-59 (le fix centralisé `safeHtml` le couvrira).
2. **Lien d'avis depuis `ctx.req.headers.origin`** (`:5055`) au lieu de `APP_URL`. Procédure
   **authentifiée** (artisan) → l'origin n'est **pas** poisonable par un tiers (≠ OPE-76
   forgotPassword non authentifié), mais pattern fragile à aligner sur `APP_URL`. LOW.

---

## Verdict

`envoyerDemande` valide l'**ownership** de l'intervention (pas de FK-injection) ; réserves
= injection HTML `client.nom` (**ajout au sweep OPE-59**) + lien via `origin` (LOW,
authentifié). **Pas de nouvelle issue Linear.**
