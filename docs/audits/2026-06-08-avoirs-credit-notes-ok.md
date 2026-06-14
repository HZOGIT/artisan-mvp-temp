# Audit — Avoirs (notes de crédit) — OK (numérotation → OPE-34)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `factures.createAvoir` (`routers.ts:1675`) + `getNextAvoirNumber`
> (`db.ts:688`). Conformité CGI des avoirs (référence facture d'origine, montants
> négatifs, pas de sur-crédit, numérotation).

---

## Conclusion : flux avoir **bien construit**. Pas de BLOCKER/HIGH propre.

### Garde-fous corrects

- **Ownership** : `dbSecure.getFactureByIdSecure(factureOrigineId, artisan.id)`.
- **Pas d'avoir sur brouillon** : `statut === "brouillon" ⇒ FORBIDDEN` (`:1701`).
- **Anti-doublon / anti sur-crédit** :
  - charge `getAvoirsByFactureId` ;
  - **bloque un 2ᵉ avoir total** si un avoir couvrant déjà l'intégralité existe
    (`:1714`) ;
  - calcule le **`soldeRestant`** = `totalTTC` − somme des avoirs existants et
    refuse si ≤ 0,01 (`:1727`) ;
  - refuse si **le nouvel avoir dépasse le solde** (`nouveauMontantTTC >
    soldeRestant + 0.01 ⇒ BAD_REQUEST`, `:1739`).
- **Document légal correct** : `typeDocument: "avoir"`, **`factureOrigineId`**
  (lien vers la facture d'origine — obligatoire), lignes à **montants négatifs**
  (HT/TVA/TTC < 0), `statut: "validee"`, recalcul des totaux.
- **Traçabilité** : double `createAuditLog` (sur l'avoir **et** sur la facture
  d'origine).

---

## Réserve — numérotation des avoirs non atomique (relève d'OPE-34)

`getNextAvoirNumber` (`db.ts:688`) reproduit **exactement** le schéma non atomique
d'OPE-34 : lecture `compteurAvoir` + `MAX(numero)` WHERE `typeDocument='avoir'`,
calcul, puis **UPDATE séparé** — **sans transaction, sans verrou, sans contrainte
UNIQUE**. Deux créations d'avoir concurrentes peuvent obtenir le **même numéro**.
Les avoirs étant des **documents à numérotation séquentielle légale** (CGI), le
correctif d'OPE-34 (allocation atomique + `UNIQUE(artisanId, numero)`) **doit
couvrir aussi** `typeDocument='avoir'`. → **Ajouté à OPE-34** par commentaire.

## Note mineure (TVA)

`tauxTVA` des lignes d'avoir a un défaut `"20.00"` (`:1683`). Si la facture
d'origine comportait des lignes à **taux réduit** (10 % bâtiment), l'appelant doit
fournir le bon taux ligne par ligne, sinon la TVA contrepassée ne correspond pas à
la TVA collectée d'origine. Relève du thème TVA (**OPE-58/OPE-21**) ; l'appelant
maîtrise les lignes. Pas d'issue.

---

## Verdict

Avoirs **conformes** : référence facture d'origine, montants négatifs, anti-doublon
et **anti sur-crédit** robustes, audit log double. Seule réserve : numérotation
non atomique, **consolidée dans OPE-34**. **Pas de nouvelle issue.**
