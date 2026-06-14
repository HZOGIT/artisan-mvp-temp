# Audit — Injection HTML dans les emails (sweep complet)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : toutes les constructions d'email (`sendEmail({ body: ... })`)
> interpolant de l'**input non fiable** dans le HTML. Consolide OPE-12
> (customMessage devis/facture) et OPE-36 (vitrine submitContact) + **4 points
> non couverts**.

---

## Rappel du mécanisme

`sendEmail` envoie `body` tel quel en `html` (aucun échappement). Toute valeur
interpolée dans un template `body: \`...${x}...\`` qui contient du HTML est rendue
**littéralement** dans l'email du destinataire → injection de liens/markup
(phishing branded).

---

## 🟠 HIGH — Points d'injection avec input **client/signataire → email ARTISAN** (non couverts par OPE-12/36)

Ici l'attaquant est un **tiers** (client via lien portail, ou signataire via lien
de signature) et la victime est **l'artisan** → phishing de l'artisan, sans
authentification.

| Endpoint | Champ injecté | Ligne |
| -- | -- | -- |
| `clientPortal.demanderModification` | `${input.message}` (client) | `routers.ts:3904` |
| `clientPortal.soumettreDemandeIA` | `${input.description}` (client) | `routers.ts:4028` |
| `signature.signDevis` | `${input.signataireName}` / `signataireEmail` | `routers.ts:2762` |
| `signature.refuseDevis` | `${input.motifRefus}` | `routers.ts:2820` |

Tous interpolent l'input **brut** dans le `body` HTML envoyé à l'email de
l'artisan. Ex. `demanderModification` :
```typescript
// routers.ts:3904
body: `<p>Le client <strong>${clientName}</strong> ... :</p>
       <blockquote ...>${input.message}</blockquote>`,   // ← message client brut
```

> Déjà tracés (même classe) : **OPE-12** (`devis`/`factures.sendEmail`
> customMessage — input artisan → client) et **OPE-36** (`vitrine.submitContact`
> — public → artisan).

---

## Fix proposé (unifié)

Échapper **toute** valeur dynamique avant insertion HTML, via un helper commun
(le `escapeHtml` existe déjà dans `webhookHandler.ts`) :

```typescript
const esc = (s='') => String(s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// body: ...${esc(input.message)}...
```

À appliquer aux 4 points ci-dessus **+ ceux d'OPE-12/OPE-36** en une passe
(centraliser un helper `safeEmailHtml`/un mini-moteur de template échappé). Voir
aussi OPE-51 (modèles d'emails) : si la feature est branchée, sa substitution de
variables devra utiliser le même échappement.

### Estimation

~0,5 j — helper d'échappement + application à tous les templates email + test
(payload `<img onerror>` rendu littéralement).

---

## Estimation totale

- HIGH (injection HTML emails — 4 points + consolidation) : ~0,5 j
