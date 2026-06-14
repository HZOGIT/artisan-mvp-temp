# Audit — Références orphelines (client/technicien supprimé) : l'UI est null-safe — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Vérification du risque de **crash client** évoqué dans OPE-73 (client supprimé) /
> OPE-62 (technicien supprimé) : un composant qui ferait `record.client.nom` sans
> garde crasherait la page (classe `/parametres`). Vérifié sur tout le client.

---

## Conclusion : pas de crash. L'UI gère les références nulles/orphelines. Pas de BLOCKER/HIGH.

### Méthode

Grep de tous les accès `.(nom|prenom|email)` sur `client`/`technicien`/`tech`/`c`/`t`
dans `client/src` **hors** optional chaining (`?.`) et guards (`x ? … : …`,
`x && …`). Chaque hit vérifié manuellement.

### Résultat : 100 % sûrs

- **`FactureDetail.tsx`** (le cas critique d'OPE-73) : **optional chaining partout**
  (`facture.client?.nom`, `?.email`, `:754-755`) + **garde avant export PDF**
  (`if (!facture || !facture.client)`, `:298`). Client supprimé → **affichage
  vide**, pas de crash.
- **Devis.tsx / Factures.tsx** (listes) : `clientName = client ? … : "-"` (gardé).
- Les hits restants (`Vehicules:162`, `Factures:191`, `CalendrierChantiers`,
  `Geolocalisation`, `Badges:331`, `Clients:194`, `PortailGestion:104`,
  `Planification`) sont des **`.map()` sur des listes vivantes** (dropdowns /
  cartes de l'artisan) → l'item itéré est toujours une entité **existante**, jamais
  une référence orpheline.

→ Aucun accès non gardé à une référence d'entité **potentiellement orpheline**.

---

## Correction d'OPE-73 (et OPE-62)

La mention « crash client possible si un composant fait `client.nom` sans garde »
est **surévaluée** : l'UI est null-safe. L'impact **réel** d'OPE-73 reste :
1. **`factures.generatePDF` (serveur) → NOT_FOUND** : PDF email/portail non
   générable (le **vrai** symptôme bloquant).
2. **Incomplétude légale** (identité client perdue, CGI).
3. **Affichage client vide** dans l'app (cosmétique, **pas un crash**).
→ Commentaire de correction ajouté à OPE-73.

---

## Verdict

Le risque de crash UI sur référence orpheline (suppression client/technicien)
**n'est pas réalisé** : optional chaining / guards / itération de listes vivantes
partout. Bonne robustesse défensive côté front. **Pas d'issue Linear** ; OPE-73
corrigée (le symptôme est PDF serveur + légal, pas un crash).
