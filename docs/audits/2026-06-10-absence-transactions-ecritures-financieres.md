# Audit — Aucune transaction DB : écritures financières multi-étapes non atomiques (factures/lignes orphelines sur échec)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : usage des transactions DB dans `server/` ; `createFactureFromDevis`
> (`db.ts:625-674`) comme cas emblématique ; opérations multi-étapes similaires.

---

## 🟠 HIGH — zéro transaction dans tout le serveur → enregistrements financiers partiels

`grep -rE "\.transaction\(|beginTransaction|commit|rollback|START TRANSACTION" server/`
→ **0 résultat**. **Aucune** opération multi-écritures n'est encapsulée dans une
transaction. Chaque `INSERT`/`UPDATE` est auto-commit indépendamment.

### Cas emblématique : `createFactureFromDevis` (`db.ts:625-674`)

Séquence **non atomique** (4 étapes) :

```
631  getNextFactureNumber()                 → incrémente le compteur (numéro consommé)
634  INSERT factures (…totaux)              → la facture existe
647  SELECT facture WHERE numero = ?
653  for ligne: INSERT facturesLignes       → copie des lignes
671  UPDATE devis SET statut='accepte'      → devis marqué converti
```

Si une **erreur DB** ou un **crash** (cf. OPE-82 — crash réaliste sur blip MySQL) survient
entre ces étapes :

- échec **pendant la boucle lignes** → **facture orpheline** : `totalTTC` copié mais
  **0 / lignes partielles** → **document légal incomplet** (le détail des lignes est
  obligatoire sur une facture FR), numéro déjà consommé/troué ;
- échec **avant l'`UPDATE devis`** (`:671`) → facture créée mais devis **non** marqué
  `accepte` → devis **reconvertible** → double facturation (recouvre l'idempotence déjà
  filée, mais ici via une **panne** et non un double-appel).

### Pas isolé — même schéma sur les autres flux financiers

| Opération | Étapes non atomiques |
| -- | -- |
| `deleteFacture` (`db.ts`) | `DELETE lignes` puis `DELETE facture` → lignes orphelines si échec entre |
| `markAsPaid` + `genererEcrituresFacture` | facture `payee` puis écritures (try/catch séparé) → payée **sans** écritures |
| Création avoir + compteur | INSERT avoir + `UPDATE compteurAvoir` |
| `createDevisWithLignes` (assistant) | INSERT devis + N INSERT lignes |
| Décrément stock + mouvement | stock et journal de mouvements peuvent diverger |

---

## Distinction (anti-doublon)

- « **Numérotation non atomique + UNIQUE** » = collision du **compteur** entre 2 créations
  concurrentes (la *valeur* du numéro). Ici : **un seul appel** qui échoue à mi-chemin →
  lignes/facture partielles. **Différent.**
- « **convertToFacture sans idempotence** » = **double appel** crée 2 factures. Ici :
  **un** appel **interrompu** laisse un état partiel. **Différent.**
- → Le manque de **transactions** est la **racine transverse** non encore tracée.

---

## Fix proposé

Encapsuler les écritures financières multi-étapes dans `db.transaction(async (tx) => { … })`
(supporté par `drizzle-orm/mysql2`) → rollback automatique sur erreur :

```typescript
return await db.transaction(async (tx) => {
  const numero = await getNextFactureNumber(devisData.artisanId, tx);
  await tx.insert(factures).values({ … });
  const facture = (await tx.select()…)[0];
  for (const ligne of lignesDevis) await tx.insert(facturesLignes).values({ … });
  await tx.update(devis).set({ statut: 'accepte' }).where(eq(devis.id, devisId));
  return facture;
});
```

Prioriser : `createFactureFromDevis`, conversion devis→facture, `markAsPaid`+écritures,
création d'avoir, `createDevis/FactureWithLignes`, mouvements de stock. (Idéalement,
**récupérer la facture insérée via `insertId`** plutôt que `SELECT … WHERE numero` —
robuste et transaction-safe.)

---

## Verdict

**Aucune transaction** dans le serveur → toute écriture financière multi-étapes peut
laisser des **enregistrements partiels/orphelins** sur erreur ou crash (facture sans
lignes = document légal corrompu, numéro troué). Racine transverse, distincte des issues
numéro/idempotence. **🟠 HIGH → issue Linear créée.**
