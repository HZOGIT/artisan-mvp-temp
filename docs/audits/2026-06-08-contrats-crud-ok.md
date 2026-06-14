# Audit — Contrats de maintenance : CRUD & facturation récurrente — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `contratsRouter` (`routers.ts:4239`) — list/getById/getByClientId/
> create/update/delete + facturation récurrente (`facturesRecurrentes`). Hors
> périmètre : `generateFacture` (idempotence → **OPE-40**) et permission
> `contrats.gerer` (→ **OPE-17**).

---

## Conclusion : pas de BLOCKER/HIGH nouveau. CRUD correctement isolé.

### Isolation multi-tenant

- `list` / `getByClientId` : scopés `artisan.id` (`getContratsByArtisanId`,
  `getContratsByClientId(clientId, artisan.id)`).
- `getById` (`:4251`) : charge le contrat puis vérifie `contrat.artisanId !==
  artisan.id` ⇒ FORBIDDEN.
- **`update` / `delete`** (`:4337`, `:4356`) : même garde d'appartenance
  (`contrat.artisanId !== artisan.id` ⇒ FORBIDDEN). **Pas d'IDOR.**

### Facturation récurrente — pas de chemin automatique de double-facturation

- `facturesRecurrentes` n'est **que lue** (`getById`, `:4263`) et **créée** dans
  `generateFacture` (`:4421`) — chemin **manuel** déjà couvert par **OPE-40**
  (idempotence/échéance).
- **Aucune génération automatique de facture de contrat dans le scheduler**
  (`grep prochainFacturation|facturesRecurrentes server/_core/index.ts` → 0). Le
  champ `prochainFacturation` est informatif. → pas de double-facturation
  automatique (contrairement aux dépenses récurrentes, auditées séparément).

---

## Réserve (mineure)

- **`contrats.create` ne valide pas `clientId`** (`:4291`) : `input.clientId` est
  inséré sans vérifier qu'il appartient à l'artisan (`getOrCreateArtisan` +
  `artisanId: artisan.id`, mais pas de `getClientByIdSecure`). Impact **faible**
  (le contrat reste sous l'`artisanId` de l'appelant ; ses lectures scopées ne
  résolvent pas un client étranger). **Même classe** que les `clientId` non
  validés déjà notés (`chantiers.create`, `devisIA.genererDevis`,
  `interventions`…) — à durcir globalement avec un helper `getClientByIdSecure`.
  Pas d'issue dédiée.

---

## Verdict

Contrats **vérifié sain** : CRUD scopé (`update`/`delete` ownership-checkés),
facturation récurrente uniquement **manuelle** (OPE-40) sans chemin scheduler de
double-facturation. Réserve mineure : `clientId` non validé à la création (faible,
classe transverse). **Pas d'issue Linear créée.**
