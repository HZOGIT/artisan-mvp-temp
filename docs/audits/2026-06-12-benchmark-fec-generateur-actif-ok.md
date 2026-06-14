# Benchmark/vérif — FEC : le générateur **conforme** est utilisé partout (ancien générateur = code mort) — OK

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification ciblée : s'assurer qu'aucun chemin **vivant** n'appelle l'**ancien**
> `genererExportFEC` (potentiellement non conforme) au lieu du nouveau **`genererFEC`**
> (18 colonnes, équilibre contrôlé, avoirs corrigés OPE-136).

---

## Conclusion : tous les exports FEC passent par `genererFEC` (conforme). L'ancien `genererExportFEC` est **du code mort** (référencé uniquement par des tests). Aucun risque, aucun ticket.

### ✅ `genererFEC` (conforme) sur **100 %** des chemins vivants

| Point d'entrée | Appel |
| -- | -- |
| `GET /api/comptabilite/fec` | `index.ts:642/648` → `genererFEC` |
| `comptabilite.getFecPreview` | `routers.ts:5701` → `db.genererFEC` |
| `comptabilite.getFecConformite` | `routers.ts:5729` → `db.genererFEC` |
| `integrationsComptables` (export) | `routers.ts:7042` → `db.genererFEC` |

→ Le FEC servi est **toujours** le 18 colonnes conforme (séparateur tab, ValidDate,
EUR, **contrôle d'équilibre débit=crédit**, avoirs en valeur absolue / sens inversé —
OPE-136). Cohérent avec l'audit `comptabilite-etats-ok` et le fix avoirs.

### 🟢 Observation mineure (tech-debt, non bloquant)

- `db.genererExportFEC` (ancien générateur) **n'est appelé par aucun code de production** :
  seules deux **assertions de test** le référencent (`sprint14.test.ts:81`,
  `sprint15.test.ts:71` : `expect(typeof db.genererExportFEC).toBe("function")`). →
  **code mort** maintenu en vie par les tests. **Nettoyage** possible (supprimer la
  fonction + adapter/retirer ces assertions) pour éviter qu'un futur dev l'appelle par
  erreur. **Non urgent**, **pas un écart de conformité** (il n'est jamais servi).

---

## Verdict

L'export **FEC** est **conforme de bout en bout** : tous les points d'entrée (endpoint,
preview, conformité, intégrations) utilisent `genererFEC` (18 col., équilibre, avoirs
corrigés). L'ancien `genererExportFEC` est **du code mort** (tests uniquement), sans
risque — simple **dette technique** à nettoyer à l'occasion. **Aucun nouveau ticket
benchmark.**
