# Audit — IDOR notes de frais : add/removeDepenseFromNoteFrais sans ownership de la note → écriture cross-tenant

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH** · **✅ CORRIGÉ (MODE A)**

> **Fix déployé** : `removeDepenseFromNoteFrais` scope le DELETE via `JOIN notes_de_frais` sur
> `n.artisan_id` (+ param `artisanId` au routeur) ; `addDepenseToNoteFrais` vérifie aussi
> l'ownership de la note. Ferme l'écriture cross-tenant. OPE-182.

> `clientPortal`… non : `notesFraisRouter.removeDepenseFromNoteFrais` (`server/routers.ts:9410`) +
> `addDepenseToNoteFrais` (`:9400`) ; `db.removeDepenseFromNoteFrais` (`db.ts:6743`) +
> `db.addDepenseToNoteFrais` (`db.ts:~6710`). Trouvé par sweep du scoping multi-tenant de la
> couche **raw-SQL** (`pool.execute`).

---

## 🟠 HIGH — `removeDepenseFromNoteFrais` : DELETE non scopé → retrait cross-tenant

```ts
// routers.ts:9410 — vérifie seulement que l'appelant A un artisan, PAS que la note lui appartient
removeDepenseFromNoteFrais: protectedProcedure
  .input(z.object({ noteId: z.number(), depenseId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw FORBIDDEN;
    await db.removeDepenseFromNoteFrais(input.noteId, input.depenseId); // ← pas d'artisanId
    await db.calculerTotalNoteFrais(input.noteId, artisan.id);
  })
```
```sql
-- db.ts:6743 — la table de liaison n'a pas d'artisan_id, et la requête ne joint pas notes_de_frais
DELETE FROM notes_frais_depenses WHERE note_id = ? AND depense_id = ?
```

→ un artisan authentifié peut passer le **`noteId` d'un AUTRE tenant** (+ un `depenseId` qui y est
lié) et **retirer cette dépense de la note de frais de la victime** (écriture cross-tenant). Le
`note_id` est séquentiel → **énumérable**. Quand la victime recalcule sa note, le total chute (la
dépense retirée n'est plus sommée) → **altération d'une demande de remboursement** d'un autre
tenant. (Le `calculerTotalNoteFrais(noteId, artisan.id)` qui suit est scopé par l'artisan **attaquant**
→ il ne met PAS à jour la note victime, mais le DELETE du lien, lui, a bien eu lieu.)

## 🟡 MEDIUM — `addDepenseToNoteFrais` : ownership de la note non vérifié

`db.addDepenseToNoteFrais(noteId, depenseId, artisanId)` (`db.ts:~6710`) vérifie que **la dépense**
appartient à l'artisan (`WHERE id=? AND artisan_id=?`) **mais pas la note** → `INSERT … (noteId,
depenseId)` peut **lier sa propre dépense dans la note d'un autre tenant**. Impact moindre (le
`calculerTotalNoteFrais` de la victime filtre `d.artisan_id = victime` → la dépense attaquant n'est
pas sommée), mais c'est un **lien cross-tenant orphelin** indésirable + check manquant.

## Impact

Violation d'**isolation multi-tenant en écriture** sur le module financier **notes de frais**
(remboursement). Exploitable par tout artisan authentifié en énumérant les `note_id`. Distinct de
l'IDOR dépenses **OPE-91** (OCR, *Done*) et de la séparation des tâches **OPE-63** ; instance non
énumérée du pattern systémique **OPE-47**.

## Fix proposé (~15 min, safe)

1. `removeDepenseFromNoteFrais` : passer `artisanId` et **scoper le DELETE via une jointure** :
   ```sql
   DELETE nfd FROM notes_frais_depenses nfd
     INNER JOIN notes_de_frais n ON n.id = nfd.note_id
    WHERE nfd.note_id = ? AND nfd.depense_id = ? AND n.artisan_id = ?
   ```
   (ou vérifier `getNoteFraisById(noteId, artisan.id)` au routeur avant l'appel).
2. `addDepenseToNoteFrais` : ajouter un contrôle d'ownership de la **note**
   (`SELECT id FROM notes_de_frais WHERE id=? AND artisan_id=?` → skip/throw si absent), en plus du
   contrôle dépense existant.

→ Behavior-preserving (un artisan agissant sur **ses** notes/dépenses est inchangé) ; ferme l'écriture
cross-tenant.

## Linear

Nouvelle issue **« Lancement 30 juin »** (HIGH). Cross-réf OPE-47 (systémique), OPE-91 (dépenses OCR),
OPE-63 (séparation des tâches).
