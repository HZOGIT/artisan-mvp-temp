# Audit — Interventions (CRUD core + mobile terrain) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `interventionsRouter` (`routers.ts:1836`) et
> `interventionsMobileRouter` (`:4515`) — list/getById/create/update/delete,
> `assignerTechnicien`, couleurs calendrier, `startIntervention`/`endIntervention`
> (signature client), `addPhoto`. (Le bypass de permission `interventions.gerer`
> est déjà dans OPE-17 ; la capture GPS dans OPE-62.)

---

## Conclusion : pas de BLOCKER/HIGH. Module bien isolé.

### Isolation multi-tenant — solide

- **CRUD core** via le pattern `dbSecure.*Secure(id, artisan.id)` :
  `getInterventionByIdSecure`, `getInterventionsByArtisanIdSecure`,
  `getClientByIdSecure` (validation du `clientId` à la création). `update`/`delete`
  re-chargent en `Secure` avant d'agir. **Pas d'IDOR.**
- **`assignerTechnicien`** (`:1980`) vérifie **deux** appartenances :
  `intervention.artisanId === artisan.id` **et** `tech.artisanId === artisan.id`
  → impossible d'assigner le technicien d'un autre tenant ni d'assigner sur une
  intervention étrangère.
- **Mobile** (`startIntervention`/`endIntervention`/`addPhoto`) : chaque route
  charge l'intervention puis vérifie `intervention.artisanId !== artisan.id` ⇒
  FORBIDDEN. `createInterventionMobile` rattache `artisanId`. Couleurs calendrier
  scopées `artisan.id`.

---

## Réserves (mineures)

1. **Signature client de fin d'intervention sans intégrité** : `endIntervention`
   stocke `signatureClient` (image base64) + `signatureDate` (`:4582+`), **sans
   hash du document/contexte ni vérification d'identité**. Parallèle d'OPE-55
   (valeur probante de la signature **devis**), mais **enjeu plus faible** : il
   s'agit d'un **accusé de réception de fin de travaux**, pas d'un engagement
   contractuel. À traiter au mieux avec OPE-55 si une refonte de la preuve de
   signature est faite. Pas d'issue séparée.

2. **`endIntervention` ne garde pas le statut courant** : il force
   `statut='terminee'` et écrase `signatureClient`/`notes` sans vérifier que
   l'intervention n'est pas déjà `terminee` → une 2ᵉ clôture écrase la 1ʳᵉ
   signature. Faible (action de l'opérateur sur ses propres données).

3. **`start`/`end` mobile en `protectedProcedure`** (pas de garde de rôle) : tout
   collaborateur du tenant peut démarrer/clôturer n'importe quelle intervention de
   l'entreprise (pas seulement celle qui lui est assignée). Comportement
   plausiblement **voulu** pour le terrain ; relève au plus du périmètre permissions
   (OPE-17). Faible.

---

## Verdict

Interventions (core + mobile) **vérifié sain** : pattern `dbSecure` systématique,
double validation d'appartenance sur `assignerTechnicien`, ownership vérifié sur
tout le flux mobile. Réserves mineures : signature de fin sans intégrité (parallèle
OPE-55, faible), pas de garde de re-clôture, start/end non gardés par rôle. **Pas
d'issue Linear créée.**
