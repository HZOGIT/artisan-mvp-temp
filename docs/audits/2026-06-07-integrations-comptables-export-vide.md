# Audit — Intégrations comptables : exports CSV/QBO vides (échec silencieux)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `integrationsComptablesRouter.genererExport` (`routers.ts:6551+`) —
> export vers Sage/QuickBooks/Ciel/EBP. Distinct d'OPE-33 (format FEC) et OPE-52
> (écritures non générées).

---

## Ce qui fonctionne correctement

- **`fec`** (`genererExportFEC`) et **`iif`** (`genererExportIIF`) construisent le
  contenu **depuis les `factures`** de la période (pas depuis
  `ecritures_comptables`) → ils **ne sont pas vides** (n'héritent pas d'OPE-52).
  ✓ (le format FEC reste à corriger via OPE-33).
- Scope artisan correct ; configuration comptable (comptes 706/445/411) paramétrable.

---

## 🟠 HIGH — Les formats `csv` et `qbo` produisent un fichier VIDE, marqué « terminé »

### Problème

`genererExport` ne gère que `fec` et `iif` ; **aucune branche pour `csv` ni
`qbo`** :

```typescript
// routers.ts:6619-6624
let contenu = '';
if (input.formatExport === 'fec')      contenu = await db.genererExportFEC(...);
else if (input.formatExport === 'iif') contenu = await db.genererExportIIF(...);
// ← 'qbo' et 'csv' : aucune branche → contenu reste ''

await db.updateExportComptable(exportRecord.id, {
  statut: 'termine',                                   // ← marqué « terminé »
  nombreEcritures: contenu.split('\n').length - 1,     // '' → 0
});
return { id: exportRecord.id, contenu };               // ← chaîne vide renvoyée
```

### Le format vide est le plus offert dans l'UI

`IntegrationsComptables.tsx:179-183` propose **CSV pour les 5 logiciels** et QBO
pour QuickBooks :

| Logiciel | Formats proposés | Vides |
| -- | -- | -- |
| Sage | fec, **csv** | csv |
| QuickBooks | iif, **qbo**, **csv** | qbo, csv |
| Ciel | fec, **csv** | csv |
| EBP | fec, **csv** | csv |
| Autre | fec, **csv** | csv |

→ Le format **CSV (disponible partout)** et **QBO** renvoient une **chaîne vide**.

### Impact

Un artisan/comptable qui choisit **CSV** (le format générique le plus courant,
offert pour tous les logiciels) ou **QuickBooks Online (QBO)** :
- télécharge un **fichier `.txt` vide** (`IntegrationsComptables.tsx:119`),
- **sans aucune erreur** (export marqué `statut: 'termine'`, « 0 écritures »).

L'« intégration comptable » (argument produit : Sage/QuickBooks/Ciel/EBP) **échoue
silencieusement** pour ces formats. Le comptable croit avoir un export, mais le
fichier est vide → perte de temps, perte de confiance.

### Fix proposé

1. **Implémenter** les générateurs `csv` (universel, prioritaire) et `qbo`, OU
2. **Retirer** `csv`/`qbo` des formats proposés (UI + enum serveur) tant qu'ils ne
   sont pas implémentés — ne pas exposer des formats vides.
3. Dans tous les cas : si `contenu === ''` pour un format demandé, **lever une
   erreur claire** au lieu de marquer l'export `termine`.

### Estimation

~0,5 j (générateur CSV + garde « contenu vide → erreur ») ; +0,5 j si QBO requis.

---

## Estimation totale

- HIGH (exports CSV/QBO vides, échec silencieux) : ~0,5–1 j
