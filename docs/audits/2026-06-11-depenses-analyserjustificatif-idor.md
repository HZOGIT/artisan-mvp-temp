# Audit — Dépenses : IDOR sur `analyserJustificatif` → `markDepenseOcrTraite` (write cross-tenant)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : `depensesRouter` (`routers.ts:8560-8705`) + helpers DB
> (`getDepenseById`/`updateDepense`/`markDepenseOcrTraite`).

---

## Conclusion : CRUD dépenses cloisonné. UN IDOR sur le marquage OCR (`markDepenseOcrTraite` non scopé). OPE-63 (séparation des tâches) connu.

### ✅ CRUD dépenses correctement cloisonné

`list`/`getById`/`update`/`delete`/`stats` passent **`artisan.id`** aux helpers, qui
scopent par `artisan_id` :
- `getDepenseById(id, artisanId)` : `WHERE id = ? AND artisan_id = ?`.
- `updateDepense(id, artisanId, data)` : `WHERE id = ? AND artisan_id = ?`, **et** `data`
  est **whitelisté** via `DEPENSE_FIELD_MAP[key]` (`if (!col) continue`) → pas de
  mass-assignment ni d'injection de nom de colonne malgré `data: z.record(z.any())`.
- `createDepense({ artisanId: artisan.id, … })` force le tenant.

→ Pas d'IDOR sur le CRUD.

### 🟠 HIGH — `analyserJustificatif` → `markDepenseOcrTraite(depenseId)` sans ownership

`analyserJustificatif` (`routers.ts:8664`, `protectedProcedure` + `checkRateLimit`) accepte
un `depenseId` optionnel et, après OCR IA, écrit le résultat dans la dépense :
```ts
// routers.ts:8697
if (input.depenseId) {
  await db.markDepenseOcrTraite(input.depenseId, data); // <- pas d'artisanId, pas d'ownership
}
```
Le helper (`db.ts`) scope par **`id` seul** :
```ts
export async function markDepenseOcrTraite(id: number, ocrData: any) {
  await pool.execute(
    `UPDATE depenses SET ocr_brut = ?, ocr_traite = TRUE WHERE id = ?`, // <- pas d'artisan_id
    [JSON.stringify(ocrData || {}).slice(0, 5000), id]
  );
}
```

**Exploitation (write cross-tenant)** : un artisan authentifié appelle
`devisIA.analyserJustificatif` (ou l'endpoint dépenses correspondant) avec
`depenseId = <id d'une dépense d'un AUTRE tenant>` (ids séquentiels énumérables) + sa
propre image. L'OCR s'exécute puis **écrase `ocr_brut`** (JSON arbitraire ≤ 5000 c.) et
met **`ocr_traite = TRUE`** sur la dépense de la **victime**.

**Impact** : altération cross-tenant de données du module financier (dépenses d'un autre
tenant) — corruption des données OCR pré-remplies / du flag de traitement. Blast radius
**limité** à `ocr_brut` + `ocr_traite` (pas de `montant`/`statut`/suppression), mais c'est
une **violation d'isolation multi-tenant en écriture** (même classe qu'OPE-38/47/89/90).
Pas de XSS (`ocr_brut` rendu via React).

### Écart connu — déjà filé

Le module dépenses est en `protectedProcedure` sans séparation des tâches → un collaborateur
peut créer **et** passer `statut`/montant via `update` (auto-approbation/auto-paiement) =
**OPE-63** (existant). Pas de doublon.

### Fix proposé

Scoper le marquage OCR par `artisanId` :
```ts
// db.ts
export async function markDepenseOcrTraite(id: number, artisanId: number, ocrData: any) {
  await pool.execute(
    `UPDATE depenses SET ocr_brut = ?, ocr_traite = TRUE WHERE id = ? AND artisan_id = ?`,
    [JSON.stringify(ocrData || {}).slice(0, 5000), id, artisanId]
  );
}
// routers.ts (analyserJustificatif) : vérifier l'appartenance avant le call
if (input.depenseId) {
  const dep = await db.getDepenseById(input.depenseId, artisan.id); // déjà scopé
  if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Dépense non trouvée" });
  await db.markDepenseOcrTraite(input.depenseId, artisan.id, data);
}
```
(Fix safe, behavior-preserving : un artisan traite **ses propres** dépenses à l'identique.)

---

## Verdict

CRUD dépenses **cloisonné** (scope `artisan_id`, `update` whitelisté). **Un IDOR write
cross-tenant** : `markDepenseOcrTraite` (via `analyserJustificatif`) écrit `ocr_brut`/
`ocr_traite` sur **n'importe quelle** dépense (scope `id` seul) → **HIGH** (isolation
multi-tenant en écriture, module financier ; blast radius limité aux 2 champs OCR). Non
couvert par les issues existantes (OPE-63 = séparation des tâches ; OPE-38 = écritures
factures). **→ Nouvelle issue Linear.**
