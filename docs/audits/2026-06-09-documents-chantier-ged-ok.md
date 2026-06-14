# Audit — Documents de chantier (GED) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : endpoints documents du `chantiersRouter` — `getDocuments` (`routers.ts:6448`),
> `addDocument` (`:6455`), `deleteDocument` (`:6468`) ; helper `assertChantierOwner`
> (`:6266`) ; table `documents_chantier` (`schema.ts:1354`).

---

## Conclusion : module GED scopé tenant. Pas de BLOCKER/HIGH.

### Multi-tenant correct (aucun IDOR)

Les trois endpoints sont gardés par **`assertChantierOwner`**, qui vérifie
`chantier.artisanId === artisan.id` (throw NOT_FOUND sinon) :
- `getDocuments(chantierId)` → `assertChantierOwner(input.chantierId, ...)` avant lecture.
- `addDocument(chantierId, …)` → `assertChantierOwner` avant insertion.
- `deleteDocument(id)` → **résout d'abord** le document (`getDocumentChantierById`), puis
  `assertChantierOwner(doc.chantierId, …)` → pas de FK-injection (le chantier parent est
  re-vérifié avant suppression).

→ Impossible de lire/ajouter/supprimer un document d'un chantier d'un autre tenant.

### Note

`fichierUrl` (`schema.ts:1439`) appartient à `exports_comptables` (autre table, scopée
`artisanId`), pas au module GED — hors périmètre (couvert par les audits FEC/exports).

---

## Réserve mineure (non bloquante, pas d'issue)

`addDocument` stocke `url`/`taille` depuis l'input sans validation de format
(artisan-contrôlé, intra-tenant). Un `url` `javascript:` rendu en `<a href>` = self-XSS
au pire (l'artisan sur ses propres documents). Reco défense-en-profondeur : valider
l'URL (http(s)/data: image) à l'ajout.

---

## Verdict

Documents de chantier : **ownership systématiquement vérifié** via `assertChantierOwner`
(lecture, ajout, suppression). Pas d'IDOR, pas de fuite cross-tenant. **Pas d'issue
Linear.**
