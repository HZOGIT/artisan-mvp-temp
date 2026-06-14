# Audit — `analyserJustificatif` (OCR de dépense par IA)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `depenses.analyserJustificatif` (`routers.ts:8487`) — OCR d'un
> justificatif via Gemini. **Pas de nouvelle issue** : un point relève d'OPE-47
> (inventaire corrigé par commentaire) ; le reste est sain.

---

## Ce qui fonctionne correctement

- **Auth + rate limit** : `getArtisanByUserId` + `checkRateLimit(artisan.id)`
  (→ 429 si dépassé). C'est un **bon contre-exemple** des endpoints IA non limités
  (cf. OPE-24 / `/api/assistant/stream`). ✓
- **Clé Gemini côté serveur** (jamais exposée). ✓
- **Erreurs sanitizées** : le base64 image est retiré du message d'erreur
  (`replace(/data:...base64,.../, "[image]")`). ✓
- L'OCR **ne modifie pas** les montants de la dépense : il écrit seulement
  `ocr_brut` (JSON brut) + `ocr_traite = TRUE`. Les `montant_ht/tva/ttc` restent
  ceux saisis/validés par l'artisan. ✓

---

## 🟡 MEDIUM (relève d'OPE-47) — IDOR sur `markDepenseOcrTraite` : pas de scope artisan

`analyserJustificatif` passe `input.depenseId` à `markDepenseOcrTraite` **sans
vérifier que la dépense appartient à l'artisan** :

```typescript
// routers.ts:8520
if (input.depenseId) await db.markDepenseOcrTraite(input.depenseId, data);
// db.ts — scope par id seul, pas d'artisanId
UPDATE depenses SET ocr_brut = ?, ocr_traite = TRUE WHERE id = ?
```

→ Un artisan peut écrire un blob `ocr_brut` (issu de **sa** propre image) et
basculer `ocr_traite = TRUE` sur la **dépense d'un autre tenant** (en devinant un
`depenseId`). **Impact faible** : pas de modification de montant, pas de fuite —
pollution du champ `ocr_brut` + flag. Mais c'est bien une **écriture cross-tenant**.

> Correction de l'inventaire OPE-47 : `depenses` était listé « scopé sauf OPE-38 ».
> Il faut ajouter `analyserJustificatif`/`markDepenseOcrTraite` aux routes
> `depenses` non scopées.

### Fix proposé

Vérifier l'appartenance avant l'écriture, et scoper le helper :

```typescript
if (input.depenseId) {
  const dep = await db.getDepenseById(input.depenseId, artisan.id); // déjà scopé
  if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
  await db.markDepenseOcrTraite(input.depenseId, data); // + WHERE artisan_id = ?
}
```

### Estimation

~20 min (à grouper avec la remédiation OPE-47).

---

## Conclusion

`analyserJustificatif` est **bien construit** (auth, rate limit, clé protégée,
erreurs sanitizées, montants non écrasés). Seul un **petit IDOR** sur
`markDepenseOcrTraite` (écriture cross-tenant du champ `ocr_brut`) est à corriger
— faible impact, rattaché à OPE-47. Pas de nouvelle issue.
