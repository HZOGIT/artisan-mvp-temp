# Audit — Bornes de longueur des entrées texte (validation / abus de stockage) — MEDIUM

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> Périmètre : entrées Zod `z.string()` du `routers.ts` vs colonnes `text()` du schéma ;
> limite body (OPE-24).

---

## Constat : ~538 `z.string()` sans `.max()`

`grep z.string() routers.ts` → **554** occurrences ; avec `.max()` → **16**. La quasi-
totalité des champs texte (`notes`, `description`, `objet`, `commentaire`, `message`,
`conditionsPaiement`…) n'a **aucune borne de longueur** côté validation.

Ils mappent majoritairement vers des colonnes **`text()`** (`schema.ts` : `notes`,
`description`, `objet`, `message`, `mentionsLegales`…).

### Impact réel (borné, d'où MEDIUM)

- **MySQL `TEXT` = 64 Ko max** : un champ > 64 Ko est **rejeté par la DB**
  (`ER_DATA_TOO_LONG`) → la mutation **échoue** (pas de corruption silencieuse), mais avec
  une **erreur 500 peu claire** au lieu d'un message de validation propre. *(C'est
  exactement le `ER_DATA_TOO_LONG` qui avait masqué le bug d'upload logo.)*
- **Limite body 50 Mo** (OPE-24, déjà filé) = vrai levier DoS mémoire ; les champs
  individuels sont **plafonnés à 64 Ko** par TEXT.
- **Abus de stockage** : un tenant peut stocker beaucoup de champs ~60 Ko → bloat
  **self-inflicted** et **par-tenant**, borné. Pas d'amplification cross-tenant.
- Pas d'amplification XSS (l'échappement est un sujet distinct, déjà couvert/filé).

→ **Aucun vecteur HIGH** : plafonné par TEXT (64 Ko) + body limit, self-inflicted. C'est un
gap de **validation/robustesse + UX d'erreur**, pas une faille.

---

## Distinction (anti-doublon)

- **OPE-24** = rate-limit + **body 50 Mo** (DoS mémoire global). Ici = **absence de `.max()`
  par champ** (validation/UX + bloat borné). Même classe « entrées non bornées » → à
  **rattacher** à OPE-24, pas dupliquer.

---

## Reco (simple, defense-in-depth)

- Ajouter des `.max()` raisonnables : `designation`/`objet` ~200, `notes`/`description`
  ~5 000, `commentaire`/`message` ~5 000, etc. → **erreur de validation claire** (400)
  au lieu d'un 500 DB, et borne le bloat.
- Centraliser via des helpers Zod (`shortText`, `longText`) pour cohérence.

---

## Verdict

La majorité des entrées texte n'ont **pas de `.max()`**, mais l'impact est **borné** par
les colonnes `TEXT` (64 Ko) et la limite body (OPE-24) → **abus de stockage self-inflicted
+ erreurs 500 peu claires**, pas de faille. **MEDIUM** (validation/robustesse), **rattaché
à OPE-24**. **Pas de nouvelle issue Linear.**
