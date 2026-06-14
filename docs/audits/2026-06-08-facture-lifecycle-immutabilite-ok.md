# Audit — Cycle de vie facture : immutabilité légale (update / delete / lignes) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `facturesRouter` — `update` (`routers.ts:1304`), `delete` (`:1380`),
> `addLigne` (`:1407`), transitions de statut. Conformité CGI (facture immuable
> une fois émise ; correction par avoir).

---

## Conclusion : immutabilité fiscale **bien implémentée**. Pas de BLOCKER/HIGH.

### Suppression — réservée aux brouillons

`delete` (`facturesSupprimerProcedure`) : ownership via
`dbSecure.getFactureByIdSecure`, puis **`statut !== "brouillon" ⇒ FORBIDDEN`**
(« Un document fiscal validé ne peut pas être supprimé. Émettez un avoir. »,
`:1392`) + **audit log**. ✓ Conforme.

### Modification — contenu verrouillé après émission

`update` (`:1304`) :
- Ownership `getFactureByIdSecure`.
- **`isLocked = statut !== "brouillon"`** : si verrouillée, toute modif de contenu
  (`objet`/`conditionsPaiement`/`notes`/`dateEcheance`) ⇒ **FORBIDDEN** (« Document
  fiscal verrouillé — Émettez un avoir pour corriger », `:1333`).
- L'input **n'accepte même pas** `totalHT/TVA/TTC` ni `numero`/`dateFacture` → les
  montants et le numéro légal ne sont pas modifiables par cette route.
- **Machine à états de statut** (`:1338`) : transitions restreintes
  (`brouillon→envoyee`, `envoyee→payee|en_retard`, `en_retard→payee` ;
  `payee`/`annulee` terminaux) + audit log.

### Lignes — verrouillées aussi

- `addLigne` (`:1407`) : ownership + **`statut !== "brouillon" ⇒ FORBIDDEN`**
  (« impossible d'ajouter des lignes », `:1426`) puis `recalculateFactureTotals`.
- **Aucune route `updateLigneFacture` / `deleteLigneFacture`** (`grep` → 0 dans le
  routeur) → les lignes d'une facture émise **ne peuvent pas** être modifiées ni
  supprimées.

→ Une facture finalisée est **réellement immuable** (contenu, lignes, montants,
numéro). C'est **plus robuste que le côté devis** (cf. OPE-50 : lignes de devis
signé encore éditables).

---

## Réserves (mineures / déjà tracées)

1. **`validee` absent de la table de transitions** (`:1339`) : `allowedTransitions`
   ne définit pas de transition depuis `validee` → une facture `validee` est figée
   côté `update`. Sans impact réel car `markAsPaid` (route dédiée) force `payee`
   indépendamment. Cohérence à clarifier.
2. **`markAsPaid` court-circuite la machine à états** et force `payee` même pour un
   **paiement partiel** → **OPE-60** (déjà tracé).
3. Sujets facture connexes déjà tracés : numérotation non atomique (**OPE-34**),
   CA en TTC (**OPE-53**), TVA PDF taux unique (**OPE-58**), paiement en ligne
   d'une facture non émise (**OPE-67**), conversion devis→facture non idempotente
   (**OPE-68**).

---

## Verdict

Cycle de vie facture **conforme CGI** : suppression limitée aux brouillons,
contenu/lignes verrouillés après émission, montants/numéro non modifiables,
transitions de statut contrôlées, audit log. Immutabilité **mieux gérée que les
devis**. **Pas d'issue Linear créée.**
