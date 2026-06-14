# Benchmark/QA — Sweep scoping SQL brut + note publique des avis : **corrects**. Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness / sécurité)

> Deux vérifications : (1) sweep multi-tenant des requêtes `pool.execute` (UPDATE/DELETE)
> ↔ Odoo `ir.rule` (record rules par société) ; (2) calcul de la **note moyenne publique**
> des avis ↔ Odoo `rating.rating` / portail (agrégat sur avis publiés).

---

## 1. ✅ Scoping multi-tenant des requêtes SQL brutes — sain

Sweep de tous les `pool.execute` mutateurs de `server/db.ts` (UPDATE/DELETE). Les requêtes
financières/sensibles sont **toutes** scopées par `artisan_id` **ou** router-gated :

- **Notes de frais** (`approuver`/`rejeter`/`payer`/`soumettre`, `db.ts:6614-6679`) :
  `WHERE id = ? AND artisan_id = ?` ; les `UPDATE depenses … JOIN notes_frais_depenses`
  incluent `d.artisan_id = ?`. ✅
- **Rapprochement bancaire** (`lierTransactionDepense:6817`, `ignorerTransaction:6827`,
  `importReleve:6789`) : `WHERE … AND artisan_id = ?`. ✅
- **Classement techniciens** (`:5036`) : `DELETE … WHERE artisanId = ?`. ✅
- **`updateSoldeConges`** (raw ajouté récemment, OPE-178) : `WHERE technicienId = ? …`
  (technicien = par-artisan via ownership routeur) + `INSERT` portant `artisanId`. ✅
- **`updateInterventionMobile`** (`:4408`, `WHERE id = ?` sans artisan) : **router-gated** —
  les 3 appelants vérifient `intervention.artisanId === artisan.id` avant l'appel
  (`routers.ts:4927/4978-caller/5037-caller`). ✅
- **`updateProfile`** (`UPDATE artisans … WHERE id = ?`, `:3774`) : `id` = l'artisan de
  `ctx.user` (pas d'input). ✅

→ Cohérent avec l'audit `2026-06-11-raw-sql-pool-execute-tenant-scoping-ok.md`. **Aucun IDOR**
introduit depuis (y compris par mes propres ajouts OPE-178/100). Pattern Odoo `ir.rule`
respecté (filtrage par société/tenant systématique).

## 2. ✅ Note moyenne publique des avis — correcte (publiés uniquement)

Vitrine publique `vitrine.getBySlug` (`routers.ts:8078`, publicProcedure) :
- **Liste** d'avis : `getPublishedAvisByArtisanId` (`:8087`) → `statut = 'publie'` uniquement.
- **Moyenne/distribution** : `getPublishedAvisStats` (`db.ts:1809`) → filtre `statut = 'publie'`,
  `moyenne = round(Σnote/total, 1)`, **garde `/0`** (`total>0 ? … : 0`). ✅

→ Un avis **masqué** par l'artisan **ne compte pas** dans la note publique ni la liste (cohérent).
Le calcul « tous avis » (`getAvisStats`, `:1834`) sert au **dashboard interne** de l'artisan
(`avis.stats:5384`) — données propres, OK. Pas de fuite d'avis masqué côté public.

> NB : la capacité de l'artisan à **masquer** des avis négatifs authentiques est un **sujet
> distinct, déjà filé OPE-41** (transparence L111-7-2) — non rouvert ici. Le **calcul** de la
> moyenne, lui, est juste.

---

## Verdict

Scoping SQL brut **sain** (tout par-artisan ou router-gated, y c. les ajouts récents) et **note
publique des avis correcte** (publiés uniquement, moyenne /0-gardée). **Aucun nouveau ticket.**
