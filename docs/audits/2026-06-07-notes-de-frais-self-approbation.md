# Audit — Notes de frais : auto-approbation / auto-remboursement (séparation des tâches)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : module **Dépenses / Notes de frais** (`depensesRouter`,
> `routers.ts:8383`). Distinct d'OPE-17 (qui liste clients/contrats/interventions/
> rdv/devis) : ce module n'y figure pas, **et** le défaut n'est pas qu'une simple
> garde de permission manquante — c'est un problème de **séparation des tâches**
> (le demandeur peut approuver et payer sa propre note).

---

## Ce qui fonctionne correctement

- **Isolation multi-tenant OK** : toutes les routes scopent par `artisan.id`
  (`getDepenseById(id, artisan.id)`, `updateDepense(id, artisan.id, …)`,
  `approuverNoteFrais(id, artisan.id, …)`…). Pas d'IDOR cross-tenant.
- `createNoteFrais` capture bien le **demandeur** : `userId: ctx.user.id`
  (`routers.ts:8604`) → la donnée nécessaire au contrôle existe.

---

## 🟠 HIGH — Un collaborateur peut créer, approuver ET payer (rembourser) sa propre note de frais

### Problème

Tout le workflow de notes de frais est en `protectedProcedure` (24/24 routes du
routeur — `grep -c requirePermission` → **0**) et il **n'existe aucun code de
permission** pour les dépenses/notes de frais (`grep -i "depense|frais|rembours"
shared/permissions.ts` → **0 résultat**). `getArtisanByUserId` **résout les
collaborateurs** (`db.ts:217`) → un `technicien` est mappé sur le même
`artisan.id` que le propriétaire.

Les trois étapes sensibles ne vérifient ni rôle ni que **l'approbateur ≠ le
demandeur** :

```typescript
// routers.ts:8647 approuverNoteFrais — uniquement scope artisan, aucun check de rôle/demandeur
const artisan = await db.getArtisanByUserId(ctx.user.id);
return await db.approuverNoteFrais(input.id, artisan.id, input.commentaire);
// routers.ts:8663 payerNoteFrais — idem
return await db.payerNoteFrais(input.id, artisan.id);
```

```sql
-- db.ts approuverNoteFrais / payerNoteFrais : seul artisan_id est contrôlé
UPDATE notes_de_frais SET statut='approuvee' WHERE id=? AND artisan_id=?;
UPDATE notes_de_frais SET statut='payee', date_paiement=CURDATE() WHERE id=? AND artisan_id=?;
-- payerNoteFrais marque AUSSI les dépenses liées remboursées :
UPDATE depenses d INNER JOIN notes_frais_depenses nfd ON nfd.depense_id=d.id
  SET d.statut='remboursee', d.rembourse=TRUE, d.date_remboursement=CURDATE()
  WHERE nfd.note_id=? AND d.artisan_id=?;
```

### Scénario d'exploitation (compte multi-utilisateurs : plans Pro/Entreprise)

1. Un `technicien` crée une **dépense** au montant arbitraire (avec un
   justificatif quelconque, ou aucun).
2. Il crée une **note de frais** (`createNoteFrais`) et y ajoute la dépense.
3. `soumettreNoteFrais` → **`approuverNoteFrais`** (s'auto-approuve) →
   **`payerNoteFrais`** (marque la note `payee` et les dépenses `remboursee`).

Aucune intervention du propriétaire/admin. Le contrôle « le demandeur ne doit pas
approuver sa propre note » — raison d'être d'un circuit de validation — est
**absent**.

### Impact

- **Fraude interne / détournement** : un salarié se rembourse lui-même des
  montants arbitraires. C'est précisément le risque qu'un workflow
  d'approbation est censé bloquer.
- **Comptabilité faussée** : `payerNoteFrais` bascule les dépenses en
  `remboursee` (`rembourse=TRUE`) → elles entrent dans les charges / la TVA
  récupérable sans validation.
- N'affecte que les **comptes multi-utilisateurs** (un artisan solo est seul) →
  HIGH, pas BLOCKER.

### Fix proposé

1. **Garde de permission** : créer `notesFrais.approuver` / `notesFrais.payer`
   (réservés owner/admin par défaut dans `ROLE_TEMPLATES`), et remplacer
   `protectedProcedure` par la procédure guard sur `approuver/rejeter/payer`
   (mécanique OPE-17, à étendre au module dépenses).
2. **Séparation des tâches** : dans `approuverNoteFrais`/`payerNoteFrais`, refuser
   si `note.userId === ctx.user.id` (`BAD_REQUEST("Vous ne pouvez pas approuver
   votre propre note de frais")`) — la donnée `userId` est déjà stockée.

### Estimation

~0,5 j — codes de permission + procédures guard + check approbateur ≠ demandeur + test.

---

## Note secondaire (mineure, pas d'issue) — support.contact : `nom`/`email` non échappés

`support.contact` (`routers.ts:8344`) échappe `message` (`< >`) mais interpole
`input.nom` / `input.email` **bruts** dans le HTML (`routers.ts:8363`). Impact
faible : émetteur **authentifié**, destinataire **interne** (`support@operioz.com`).
À regrouper avec le sweep d'échappement email (OPE-59) si une passe est faite ;
pas d'issue dédiée.

---

## Estimation totale

- HIGH (auto-approbation/remboursement notes de frais) : ~0,5 j
