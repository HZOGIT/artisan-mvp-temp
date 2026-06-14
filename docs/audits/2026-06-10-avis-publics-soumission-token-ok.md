# Audit — Avis clients : soumission publique (token, usage unique, binding) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `avis.submitAvis` (`routers.ts:5174-5223`), `getDemandeInfo` (`:5226`),
> binding via `getDemandeAvisByToken` ; modération `avis.moderer` (`:5154`).

---

## Conclusion : soumission d'avis robuste contre le bombing/stuffing. Pas de BLOCKER/HIGH.

La réputation publique de l'artisan dépend de ces avis → cibles : faux avis anonymes,
bourrage (multi-soumission), usurpation du binding artisan/client.

### Token lié à une vraie demande (pas d'avis anonyme)

`submitAvis` exige un `token` résolu par `getDemandeAvisByToken(input.token)` (`:5181`) :
seul le destinataire d'une **demande d'avis réelle** (émise par l'artisan pour un
`clientId`/`interventionId` précis) peut soumettre. Un anonyme **sans lien valide** →
`NOT_FOUND`.

### Usage unique (anti-bourrage)

- `if (demande.statut === 'completee')` → `BAD_REQUEST` « Vous avez déjà donné votre avis »
  (`:5186-5188`) ;
- après création, `updateDemandeAvis(demande.id, { statut: 'completee' })` (`:5206`).

→ **Un avis par demande** : impossible d'empiler plusieurs avis avec le même lien.

### Binding non falsifiable + bornes

- `artisanId`/`clientId`/`interventionId` de l'avis sont **dérivés de `demande`** (serveur),
  **pas** de l'input (`:5196-5198`) → le soumetteur ne peut pas cibler/attribuer un autre
  artisan.
- `note: z.number().min(1).max(5)` (`:5177`) → note bornée.
- **Expiration** : `if (new Date() > demande.expiresAt)` → `BAD_REQUEST` lien expiré
  (`:5190-5192`).
- Token de demande fort (`tokenDemande varchar(64).unique()` au schéma).

---

## Écart connu = modération, **déjà filé**

`avis.moderer` (`:5154`, `statut: publie|masque`) permet à l'artisan de **masquer des avis
négatifs authentiques** → note publique gonflée sans transparence. **Déjà filé**
(« Avis : l'artisan peut masquer des avis négatifs authentiques »). Pas de doublon.

### Réserve LOW

- `commentaire` (texte client public) : à l'affichage sur la vitrine, l'échappement repose
  sur le rendu **JSX React** (auto-échappé sauf `dangerouslySetInnerHTML`). Les audits XSS
  (xss-assistant / messagerie) couvrent ce vecteur ; rien de spécifique ici.

---

## Verdict

Soumission d'avis : **token lié à une demande réelle**, **usage unique** (anti-bourrage),
**binding serveur** non falsifiable, **expiration** et **note bornée**. Pas de
review-bombing ni de stuffing. Seul écart = **masquage d'avis négatifs** (modération),
**déjà filé**. **Pas de nouvelle issue Linear.**
