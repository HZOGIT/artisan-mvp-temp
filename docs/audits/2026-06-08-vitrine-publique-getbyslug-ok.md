# Audit — Vitrine publique (`vitrine.getBySlug`) : exposition de données — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `vitrine.getBySlug` (`routers.ts:7464`, publicProcedure) — page
> vitrine publique servie par slug. (Le formulaire `submitContact` est OPE-36.)

---

## Conclusion : exposition publique maîtrisée. Pas de BLOCKER/HIGH.

### Gating

- Artisan résolu par slug ; **NOT_FOUND si introuvable**.
- **Gate `parametres.vitrineActive`** (`:7471`) : si la vitrine n'est **pas
  activée** → NOT_FOUND. → seuls les artisans ayant **explicitement publié** leur
  vitrine sont exposés. ✓

### Champs renvoyés — projection sans fuite

```typescript
// routers.ts:7493 — projection explicite de l'artisan
{ nomEntreprise, specialite, telephone, email, ville, codePostal, adresse, siret, logo }
```

- Tous **destinés à une page vitrine publique** (identité commerciale + contact +
  SIRET, qui est public via INSEE).
- **N'expose PAS** `iban`, `numeroTVA`, `tauxTVA`, `userId` ni la ligne artisan
  brute → pas de fuite de champs sensibles/internes (contraste avec un `getById`
  non projeté).

### Stats publiques — comptes, pas de financier

- `getVitrinePublicStats` → `{ totalClients, totalInterventions (terminées) }` :
  **comptes marketing**, **aucun montant** (pas de CA/revenu).
- `getPublishedAvisStats` → `{ moyenne, total, distribution }` : avis **publiés**
  uniquement. (Le rendu est échappé — JSX ; cf. avis-public-ok. La modération/
  note gonflée = **OPE-41**.)

---

## Réserves (mineures, non bloquantes)

1. **Pas de rate limit** sur `getBySlug` (lecture publique non authentifiée) →
   scraping possible, mais données **marketing publiques** → risque faible.
2. **`totalClients`** révèle la **taille d'activité** de l'artisan (stat marketing
   assumée en activant la vitrine). Acceptable.
3. La vitrine reste **publique même si l'abonnement expire** (gate uniquement sur
   `vitrineActive`, pas sur le statut d'abonnement) → décision **produit** (garder
   la page pour ne pas casser les liens, ou la couper). Pas de sécurité/légal.

---

## Verdict

`vitrine.getBySlug` **sain** : gate `vitrineActive`, projection des champs (aucun
IBAN/TVA/interne), stats = comptes (pas de financier), avis publiés + échappés.
**Pas d'issue Linear.**
