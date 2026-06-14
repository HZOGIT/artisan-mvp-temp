# Benchmark — Comptabilité : états/reports (balance, grand livre, journaux, FEC) vs Odoo `account` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : les **états comptables** exposés par `comptabiliteRouter`
> (`server/routers.ts:5563`) + `server/db.ts` ↔ Odoo `account` (reporting : general
> ledger, trial balance, journals, tax report). **Hors** périmètre ici : les écarts de
> *conformité* déjà filés (cf. plus bas).

---

## Conclusion : le **socle d'états comptables est présent et au niveau MVP**. Les écarts restants sont des **raffinements de conformité déjà filés**, pas des reports manquants. Aucun nouveau ticket.

### ✅ Reports présents (vs Odoo `account` reporting)

| État Odoo | Operioz | Référence |
| -- | -- | -- |
| **Grand livre** (general ledger) | `getGrandLivre` | `db.ts:2575` |
| **Balance** (trial balance) | `getBalance` | `db.ts:2600` |
| **Journal des ventes** | `getJournalVentes` | `db.ts:2624` |
| **Rapport de TVA** | `getRapportTVA` | `db.ts:2636` |
| **Déclaration TVA (CA3) par taux** | `getDeclarationTVADetail` | `db.ts:2660` |
| **FEC** (réglementaire) + contrôle de conformité | `genererFEC` / `getFecPreview` / `getFecConformite` | `db.ts:5471` |
| **Plan comptable** | `getPlanComptable` / `initPlanComptable` | `db.ts` |
| Écritures (journal) | `getEcritures` / `getEcrituresComptables` | `db.ts:2567` |

→ Un artisan dispose des **états essentiels** (grand livre, balance, journal, TVA/CA3) et
de l'**export FEC** conforme avec **contrôle d'équilibre** — exactement ce qu'attend
l'expert-comptable pour reprendre la compta.

### Écarts restants = **conformité déjà filée** (pas des reports manquants)

| Sujet | Issue |
| -- | -- |
| Inaltérabilité des écritures (loi anti-fraude TVA 286-I-3°bis) | **OPE-118** |
| Clôture d'exercice / date de verrouillage | **OPE-119** |
| Avoirs → montants négatifs FEC | **OPE-136** *(corrigé)* |
| Plan comptable seedé aligné sur le FEC | **OPE-139** *(corrigé)* |
| Exigibilité TVA encaissements vs débits (CA3) | **OPE-145** |
| Coefficient de déductibilité TVA (carburant 80 %…) | **OPE-153** |
| Contrepartie notes de frais (401 vs 421/425) | **OPE-163** |

### 🟢 Observation mineure (non bloquante)

- Côté **UI**, seul le **journal des ventes** est exposé comme état dédié ; les **journaux
  achats/banque** ne sont pas un report UI distinct — mais ils figurent dans le **FEC**
  (`genererFEC` génère VE/AC/BQ) que l'expert-comptable importe. **Mineur** (l'artisan
  consulte rarement le journal des achats en-app). Élargir `getJournal*` serait un plus,
  non prioritaire.

---

## Verdict

Le **socle d'états comptables** d'Operioz (grand livre, balance, journal des ventes,
rapport TVA, CA3, **FEC conforme avec contrôle d'équilibre**, plan comptable) est **au
niveau MVP** d'Odoo `account` reporting. Les écarts ouverts relèvent tous de la
**conformité** (inaltérabilité, clôture, exigibilité, déductibilité, contrepartie) et sont
**déjà filés** (OPE-118/119/145/153/163). Le seul manque UI (journaux achats/banque) est
**couvert par l'export FEC**. **Aucun nouveau ticket benchmark.**
