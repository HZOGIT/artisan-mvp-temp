# Audit — Relance devis (`envoyerRelance`) : ownership OK ; injection HTML `message` = classe OPE-12

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `facturesRouter.envoyerRelance` (`routers.ts:1014-1058`) — relance manuelle
> de signature d'un devis.

---

## Conclusion : ownership correct. Le `message` non échappé = **même classe qu'OPE-12** (endpoint additionnel).

### Ownership / ciblage — corrects

- `devisData.artisanId !== artisan.id → NOT_FOUND` (`:1026`) → pas d'IDOR (relance d'un
  devis d'un autre tenant).
- Client résolu depuis le devis **scopé** (`getClientById(devisData.clientId)`) → bon
  destinataire ; envoi à `client.email`. Relance enregistrée scopée
  (`createRelanceDevis({ artisanId: artisan.id })`).

### 🟠 Injection HTML via `input.message` (même pattern qu'OPE-12)

```typescript
// :1036 / :1044
const messageRelance = input.message || `… défaut …`;
body: `… <p style="white-space: pre-line;">${messageRelance}</p> …`   // brut, non échappé
```

`input.message` (message de relance personnalisé par l'artisan) est inséré **sans
échappement** dans le HTML de l'email envoyé **au client** → **injection HTML**
(artisan-controlled → phishing de son propre client / HTML branded Operioz). **Identique**
à **OPE-12** (« Injection HTML dans customMessage emails devis/facture »,
`routers.ts:875` & `:1548`) — mais **`envoyerRelance:1044` est un endpoint SUPPLÉMENTAIRE**
non listé dans OPE-12.

---

## Distinction (anti-doublon)

- **OPE-12** = même classe (customMessage HTML non échappé) sur `devis.sendEmail` (875) +
  `factures.sendEmail` (1548). `envoyerRelance` (1044) = **3ᵉ instance** du même pattern →
  **à rattacher à OPE-12** (même fix : `escapeHtml(message)`), **pas une issue séparée**.

---

## Verdict

`envoyerRelance` est **bien cloisonné** (ownership devis + client scopé), mais injecte
`input.message` **brut** dans l'email client = **instance supplémentaire d'OPE-12**.
**Rattaché à OPE-12** (commentaire). **Pas de nouvelle issue Linear.**
