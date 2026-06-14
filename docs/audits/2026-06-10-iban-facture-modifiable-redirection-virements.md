# Audit — IBAN de facturation modifiable sans contrôle → redirection des virements clients (fraude)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : affichage IBAN sur la facture (`pdfGenerator.ts:593-597`), modification via
> `artisan.updateProfile` (`routers.ts:82-139`), schéma (`schema.ts:59`).

---

## 🟠 HIGH — changer l'IBAN redirige les paiements par virement, sans aucun garde-fou

### L'IBAN est imprimé sur chaque facture comme coordonnée de paiement

```typescript
// pdfGenerator.ts:593-597
if (a.iban) {
  doc.text("Règlement par virement bancaire :", MARGIN, footerY);
  doc.text(`IBAN : ${a.iban}`, MARGIN, footerY + 4);
}
```

→ Les clients qui paient par **virement** (cas fréquent en B2B) envoient l'argent sur
**cet** IBAN.

### Il se modifie sans ré-auth, sans confirmation, sans notification, sans validation

`artisan.updateProfile` (`routers.ts:82`) accepte `iban: z.string().optional()` (`:94`)
et fait `updateArtisan(artisan.id, { iban })` :

- **Aucune ré-authentification** (pas de mot de passe demandé) ;
- **Aucune confirmation** (pas de vérification que le nouvel IBAN appartient à l'artisan) ;
- **Aucune notification** à l'artisan (« votre IBAN a été modifié ») ;
- **Aucune validation** de format (IBAN/clé) ;
- la procédure est `protectedProcedure` (**pas de garde de rôle**) **et whitelistée par le
  paywall** → appelable par **tout utilisateur authentifié du tenant**, y compris un
  collaborateur `secretaire`/`technicien`.

### Scénarios de fraude (redirection de virements)

1. **Insider** : un collaborateur change l'IBAN → toutes les **futures factures** affichent
   l'IBAN de l'attaquant → les clients virent **chez lui**. Furtif (pas de notif).
2. **Session compromise** (XSS in-session — CSP désactivée ; ou via l'ATO d'OPE-85) :
   l'attaquant change l'IBAN → même résultat.

Perte financière directe (argent des clients détourné), l'artisan reste dû du travail, +
litige/réputation. Type **fraude au virement / BEC**.

---

## Distinction (anti-doublon)

- **OPE-85** (changement d'email sans ré-auth) = prise de **contrôle du compte**. Ici =
  détournement **financier** via un autre champ (`iban`) et une autre procédure
  (`updateProfile`) ; même **racine** (mutation sensible sans ré-auth) mais **impact et fix
  distincts**.
- **OPE-17** (4 routers + 6 routes bypassent les rôles) = portée des permissions. Le
  problème IBAN persiste **même** avec un rôle gate (le **propriétaire**, ou un attaquant
  de session, peut toujours changer l'IBAN sans confirmation/notification). → complémentaire.
- Aucune issue ne couvre la **modification non contrôlée de l'IBAN de facturation**. Pas de
  doublon.

---

## Fix proposé

1. **Ré-authentification** (`currentPassword`) + **notification** à l'email du
   propriétaire sur tout changement d'IBAN (idéalement double-opt-in : confirmer avant
   d'appliquer).
2. **Valider** le format IBAN (longueur/clé MOD-97) à la saisie.
3. **Tracer** le changement (audit log — cf. lacune piste d'audit) avec ancienne/nouvelle
   valeur.
4. **Gate de rôle** sur la modification du profil de facturation (réservé propriétaire/
   admin), pas tout collaborateur.

---

## Verdict

L'**IBAN imprimé sur les factures** est modifiable via `updateProfile` **sans ré-auth, ni
confirmation, ni notification, ni validation**, par **tout utilisateur du tenant** → un
changement furtif **redirige les virements clients** vers un tiers (fraude au virement).
Distinct d'OPE-85/OPE-17. **🟠 HIGH → issue Linear créée.**
