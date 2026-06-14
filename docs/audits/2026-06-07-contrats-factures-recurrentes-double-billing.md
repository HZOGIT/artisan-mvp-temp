# Audit — Contrats de maintenance / facturation récurrente

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `contrats.generateFacture` (`routers.ts:4369`) et la table
> `factures_recurrentes`. Distinct d'OPE-25 (IDOR `contrats.create`).

---

## Ce qui fonctionne correctement

- **Ownership** : `generateFacture` vérifie `contrat.artisanId === artisan.id`
  (FORBIDDEN sinon). ✓
- Calcul du montant TVA/TTC côté serveur depuis le contrat. ✓
- Trace de la période facturée dans `factures_recurrentes`
  (`periodeDebut`/`periodeFin`) + mise à jour de `contrat.prochainFacturation`. ✓

---

## 🟠 HIGH — `generateFacture` sans garde d'idempotence/période → double facturation du client

### Problème

`contrats.generateFacture` (`routers.ts:4369`) génère une facture pour un contrat
**sans aucune vérification qu'une facture a déjà été émise pour la période
courante**, ni que l'échéance est atteinte :

```typescript
// routers.ts:4369 (résumé)
.mutation(async ({ ctx, input }) => {
  const contrat = await db.getContratById(input.contratId);
  // ... ownership OK ...
  const numero = await db.getNextFactureNumber(artisan.id);
  const facture = await db.createFacture(artisan.id, {
    clientId: contrat.clientId, numero,
    // ...
    statut: "envoyee",                      // ← document fiscal finalisé d'emblée
  });
  await db.createLigneFacture({ /* ... */ });
  await db.createFactureRecurrente({
    contratId: contrat.id, factureId: facture.id,
    periodeDebut: now,                      // ← période = instant de l'appel, pas l'échéance
    periodeFin, genereeAutomatiquement: false,
  });
  await db.updateContrat(contrat.id, { prochainFacturation: periodeFin });
  return facture;
})
```

Aucune des protections attendues n'est présente :
- **Pas de vérif d'échéance** : on ne teste pas `now >= contrat.prochainFacturation` ;
  on peut donc facturer en avance, autant de fois qu'on veut.
- **Pas de vérif de doublon de période** : aucun `SELECT` dans
  `factures_recurrentes` pour voir si la période courante est déjà facturée.
- **Pas de contrainte DB** : `factures_recurrentes` n'a pas d'unicité sur
  `(contratId, periodeDebut)` (cf. schéma).
- `periodeDebut = now` (instant de l'appel) au lieu de la période planifiée → deux
  appels rapprochés créent **deux périodes différentes** qui ne se « détectent »
  pas mutuellement.

### Impact

Deux appels (double-clic, re-soumission UI, retry réseau) sur « Générer la
facture » créent **deux factures** pour le même contrat → **le client est
facturé deux fois** pour la même période. Et comme chaque facture est créée
directement en `statut: "envoyee"` (document fiscal finalisé, non supprimable —
cf. guard `delete` brouillon uniquement), corriger impose **d'émettre un avoir**.
Deux numéros de facture sont aussi consommés (cf. OPE-34).

### Fix proposé

Avant création, refuser si déjà facturé / pas encore dû :

```typescript
const now = new Date();
if (contrat.prochainFacturation && now < new Date(contrat.prochainFacturation)) {
  throw new TRPCError({ code: "BAD_REQUEST",
    message: `Prochaine facturation prévue le ${...}. Facture déjà émise pour cette période.` });
}
// (et/ou) vérifier qu'aucune facture_recurrente ne couvre la période courante.
```
+ contrainte `UNIQUE(contratId, periodeDebut)` sur `factures_recurrentes` comme
filet de sécurité, et caler `periodeDebut` sur l'échéance planifiée plutôt que
sur `now`.

### Estimation

~1 h — garde d'échéance + contrainte UNIQUE + test double-clic.

---

## Point secondaire (documenté, < HIGH)

- **Statut `envoyee` sans envoi** : la facture est marquée `envoyee` mais
  `generateFacture` n'appelle **pas** `sendEmail` — le statut ne reflète pas la
  réalité (le client n'a rien reçu). Soit envoyer réellement, soit créer en
  `validee`.
- **Ligne sans `montantTVA`** : `createLigneFacture` est appelé sans
  `montantTVA` (seulement `montantHT`/`montantTTC`), et `recalculateFactureTotals`
  n'est pas rappelé → la ligne n'a pas sa ventilation TVA (les totaux d'en-tête,
  eux, sont corrects car posés explicitement). Incohérence mineure de la ligne.

---

## Estimation totale

- HIGH (double facturation contrat) : ~1 h
