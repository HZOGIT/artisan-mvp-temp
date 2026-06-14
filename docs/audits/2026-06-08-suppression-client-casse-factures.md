# Audit — Suppression d'un client : casse l'identité de ses factures (rétention CGI + PDF non régénérable)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `clients.delete` (`routers.ts:196`) → `deleteClientSecure`
> (`db-secure.ts`). Distinct d'OPE-26 (effacement du **compte artisan**) : ici
> l'artisan supprime un **client**.

---

## Ce qui fonctionne

- **Ownership** : `getClientByIdSecure(id, artisan.id)` + `deleteClientSecure`
  scopé. Pas d'IDOR.
- La suppression **n'efface que la ligne `clients`** (pas de cascade destructive
  sur les factures) → les factures **survivent** (la rétention de la ligne est OK).

## 🟠 HIGH — Aucune garde : supprimer un client **casse toutes ses factures**

`deleteClientSecure` fait un `DELETE FROM clients` **sans vérifier** que le client a
des factures/devis, et **`factures` n'a aucune identité client dénormalisée** :

```typescript
// schema.ts factures — SEULE référence au client = la FK
clientId: int("clientId").notNull(),   // ← pas de nom/adresse/SIRET dénormalisés
```

Donc après suppression du client, `getClientById(facture.clientId)` renvoie
`undefined`, et :

- **`factures.generatePDF`** (`routers.ts:1496-1504`) : `if (!client) throw
  NOT_FOUND` → **le PDF de la facture ne peut plus être généré** (« Client non
  trouvé »). Idem PDF portail, **FEC**, **Factur-X** (qui ont tous besoin du
  client).
- **`factures.getById`** renvoie `{ ...facture, client: null }` → la page
  FactureDetail s'affiche sans client (et crash possible si un composant fait
  `client.nom` sans garde — classe `/parametres`).

### Impact légal

- **CGI art. 242 nonies A** : une facture **doit** comporter l'**identité du
  client**. En supprimant le client, l'identité — seule source étant la FK — est
  **perdue** → les factures conservées (obligation **10 ans**, art. L102 B) sont
  **incomplètes/inexploitables**.
- Tension RGPD/CGI : l'artisan peut « effacer » un client, mais cela **corrompt
  silencieusement** ses propres documents légaux.

### Fix proposé

Au choix (idéalement 1 + 3) :
1. **Bloquer la suppression** d'un client ayant des factures non-brouillon →
   `FORBIDDEN` (« Ce client a des factures, il ne peut pas être supprimé ») —
   cohérent avec l'immutabilité facture déjà en place.
2. **Soft-delete / anonymiser** le client (statut inactif) en conservant le lien
   facture.
3. **Dénormaliser l'identité client** sur la facture **à l'émission** (snapshot
   nom/adresse/SIRET) → la facture devient **auto-portante** (bonne pratique : une
   facture fige l'identité du client au moment de l'émission, indépendamment d'une
   FK vivante). Corrige aussi le PDF/FEC/Factur-X.

### Estimation

~0,5 j (garde de suppression + message ; le snapshot dénormalisé = ~1 j séparé).

---

## Estimation totale

- HIGH (suppression client casse factures : rétention/identité CGI + PDF non
  régénérable) : ~0,5 j (garde) / ~1 j (snapshot)
