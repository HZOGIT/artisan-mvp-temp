# Plan de déblocage — activer les domaines « difficiles » du nouveau stack

> Demandé le 2026-06-14. **Constat** : 12/30 domaines servent le trafic staging via le nouveau stack
> (tous les domaines « faciles » à parité de surface). Les ~18 restants ne s'activent pas car ils
> dépendent de **4 ports/seams lourds non encore portés**, ou relèvent de la **surface hors-tRPC**.
> Empiler des reads supplémentaires ne débloque rien : il faut **porter ces ports**, proprement
> (clean-archi : interface `src/shared/ports/` + adapter + fakes + tests), puis brancher.

## Carte des blocages (qui bloque quoi)

| Blocage (port/seam non porté) | Domaines / procédures bloqués | Sévérité |
|---|---|---|
| **ComptaPort write (FEC)** | `factures.markAsPaid` (écritures vente+encaissement), domaine `comptabilite` (`ecritures`, balance, grand-livre, **export FEC**), `factures.enregistrerPaiement` (écritures réelles au lieu du NOOP) | 🔴 sensible (FEC débit=crédit) |
| **Pdf port** (+ **EmailPort pièces jointes**) | `commandesFournisseurs.sendEmail` (bon de commande PDF joint), `factures`/`devis` envoi PDF par email, génération **iCal** (rdv) | 🟠 |
| **LLM port** | `commandesFournisseurs.genererDepuisDevisIA`, `devisIA.*`, `assistant.*` (SSE), suggestions IA (articles) | 🟠 (en dernier) |
| **Surface HORS-tRPC** (routes Fastify) | auth login/signup/reset + **émission JWT**, **webhooks Stripe** (subscription), **uploads** (+ OCR), **PDF/iCal** publics, **vitrine/portail** publics par token | 🔴 (auth/Stripe) |
| **Resolver multi-utilisateurs** (finding) | auth des **collaborateurs** (secrétaire/technicien) : `DrizzleTenantResolver` ne résout que l'artisan **possédé** (`artisans.userId`), pas les users rattachés → un collaborateur n'obtient pas son tenant | 🟠 (à corriger avant cutover réel) |

> Domaines restants à parité fine « simple » (pas de port lourd, juste du travail incrémental) :
> `depenses` (parent : lignes dépense↔note [OPE-267], copierBudgetsMois, stats), `previsions`
> (forecasting), `interventions`/`chantiers` (sous-ressources équipe/calendrier/suivi), `articles`
> (bibliothèque), `contrats` (interventions de maintenance + `generateFacture` → dépend de ComptaPort),
> `avis`/portail (public). Ceux-là avancent en // sans débloquer de port.

---

## §1 — ComptaPort write (FEC) — ✅ **DÉJÀ FAIT** (découvert 2026-06-14)

> **MISE À JOUR** : le `ComptaPort` write **était déjà porté** — `buildApp` câble par défaut le vrai
> `ComptaEcrituresAdapter` (domaine `ecritures`), avec Σdébit=Σcrédit garanti et idempotence, testé
> (`fec-e2e`, `ecriture-invariants`). `factures.markAsPaid` a donc été **exposé** (use-case
> `marquerFacturePayee`, FEC-correct). Il ne reste à `factures` que **`sendByEmail`** (→ §2). Le
> domaine `comptabilite` (lecture : balance/grand-livre/exportFec) est déjà migré (`ecritures`).
> **Section conservée ci-dessous pour mémoire du raisonnement.**

### (mémoire) Plan initial §1 — ComptaPort write (FEC)

**Débloque** : `factures.markAsPaid` (→ activation de `factures`, il ne manque QUE ça), écritures réelles
d'`enregistrerPaiement`, et le **domaine `comptabilite`** (ecritures/balance/grand-livre/export FEC).

**Le seam existe déjà** : `src/modules/factures/application/.../ComptaPort` est un **NoopComptaPort**
(`genererEcrituresVente(ctx,id)` / `genererEcrituresEncaissement(ctx,id)` ne font rien). La logique
legacy existe (`db.genererEcrituresFacture` = vente 411 Client / 706 Ventes / 44571 TVA collectée ;
`db.genererEcrituresEncaissement` = banque 512 / 411 lettré).

**Approche (clean-archi, sensible)** :
1. Inspecter la table `ecritures_comptables` (colonnes : compte, débit, crédit, libellé, date, factureId, journal…) + RLS.
2. Adapter `ComptaPortDrizzle implements ComptaPort` :
   - `genererEcrituresVente(ctx, factureId)` : lit la facture (totaux HT/TVA/TTC), **génère les écritures** (débit 411 = TTC ; crédit 706 = HT ; crédit 44571 = TVA), **idempotent** (delete-then-insert par factureId+journal), **scopé tenant**.
   - `genererEcrituresEncaissement(ctx, factureId)` : débit 512 (banque) / crédit 411 (lettrage), montant = payé.
3. ⚠️ **INVARIANT non négociable** : pour chaque écriture générée, **Σ débit = Σ crédit** (assert dans l'adapter + test dédié). Réutiliser le harnais d'invariants.
4. `markAsPaid` : exposer une route `markAsPaid {id, montantPaye, datePaiement}` qui **écrase** montantPaye + force `payee` + appelle `ComptaPort` (parité legacy exacte — ⚠️ pas la sémantique cumulative d'`enregistrerPaiement`). Brancher le `ComptaPortDrizzle` par défaut dans `buildApp` (déjà injectable via `deps.compta`).
5. Tests : adapter (écritures correctes, **débit=crédit**, idempotence, isolation) + e2e markAsPaid (statut payee + écritures en base) + balance équilibrée.
6. → **activer `factures`** (12→13 domaines). Puis migrer le routeur `comptabilite` (ecritures/balance/grand-livre/exportFec) comme un domaine à part (recette 9 étapes).

**Effort** : moyen-élevé. **Risque** : élevé (FEC) → tests d'invariant stricts, STOP+ALERT si déséquilibre.

---

## §2 — Pdf port + EmailPort pièces jointes

**Débloque** : `commandesFournisseurs.sendEmail` (→ activation de commandesFournisseurs avec §3), envoi
PDF des factures/devis, iCal des rdv.

**Approche** :
1. `PdfPort` existe (`src/shared/ports/` + `FakePdfPort`). Ajouter un adapter `LegacyPdfAdapter`
   qui **réutilise** les générateurs legacy (`generateBonCommandePDF`, `generateFacturePDF`,
   `generateDevisPDF`) via le **pattern variable-de-chemin** (import string non-littéral → tsc ne tire
   pas le graphe legacy ; cf. `LegacyEmailAdapter`).
2. Étendre `EmailPort` : `send({to, subject, body, attachments?: {filename, content: Buffer, contentType}[]})`.
   Mettre à jour `LegacyEmailAdapter` (Resend supporte les pièces jointes) + `FakeEmailPort` (capter `attachments`).
3. Use-case `envoyerCommandeParEmail(commandeRepo, fournisseurRepo, pdfPort, emailPort, ctx, id)` :
   ownership 404, fournisseur.email requis (400), rate-limit (`SlidingWindowRateLimiter` déjà présent),
   PDF via `pdfPort`, email via `emailPort` (best-effort). Tests via `FakePdf`/`FakeEmail`.
4. iCal : un `IcalPort` similaire (ou util pur) pour les rdv si le client en a besoin.

**Effort** : moyen. **Risque** : faible (pas d'invariant financier ; best-effort).

---

## §3 — LLM port (EN DERNIER, « assistant/IA en dernier »)

**Débloque** : `commandesFournisseurs.genererDepuisDevisIA` (→ activation de commandesFournisseurs),
`devisIA`, `assistant` (⚠️ **SSE streaming** — le dispatcher est déjà streaming-safe).

**Approche** :
1. `LlmPort` : `complete(prompt, opts)` + `stream(prompt, opts): AsyncIterable<string>` (pour l'assistant).
   Adapter sur le provider actuel (vérifier : Gemini/MonAssistant côté legacy, cf. audits `monassistant-gemini`).
2. `genererDepuisDevisIA` : use-case composant `devisReader` (lignes du devis) + `stockRepo` (ajuster selon
   stock) + `LlmPort` → propose les articles à commander. Tests avec un **FakeLlmPort** déterministe.
3. `assistant`/`devisIA` : routes/SSE — vérifier le passage du flux par le dispatcher (déjà OK).

**Effort** : élevé. **Risque** : moyen (coût/latence ; pas d'invariant data).

---

## §4 — Surface HORS-tRPC (routes Fastify, priorité 4)

Indépendant des ports ci-dessus, mais **indispensable au cutover réel** :
1. **Auth** (OPE-238) : `POST /api/auth/login|signup|reset` + **émission du JWT** (cookie `token`, même
   secret/format que `verifyAuthToken`) + révocation (sessions). ⚠️ corriger le **resolver multi-users**
   (collaborateurs) en même temps.
2. **Webhooks Stripe** (OPE-236) : `POST /api/webhooks/stripe` (signature vérifiée, idempotent, maj `subscriptions`).
3. **Uploads** (+ OCR justificatifs), **PDF/iCal publics**, **vitrine/portail publics par token**.
   Routes Fastify dédiées, scopées par token public (pas de cookie tenant).

**Effort** : élevé (auth/Stripe sensibles). **Risque** : élevé (auth/paiement) → en dernier, tests stricts.

---

## Ordre recommandé (par ROI × risque maîtrisé)

1. **§1 ComptaPort write (FEC)** → active **`factures`** + ouvre le domaine `comptabilite`. (Le plus de valeur ; invariant débit=crédit testé.)
2. **§2 Pdf + Email-attachments** → débloque l'envoi PDF (sendEmail, factures/devis).
3. **Parité fine en // ** (sans port) : `depenses` (lignes/budgets/stats → activer le parent), `previsions` reads, `interventions`/`chantiers` sous-ressources → autant d'activations « gratuites ».
4. **§4 Auth + Stripe webhooks** (surface hors-tRPC) — prérequis du cutover réel.
5. **§3 LLM** → débloque commandesFournisseurs (IA) + assistant. En dernier.
6. **Reconciliations restantes** (comptabilite.ecritures/notesDeFrais sous-routeurs) + extinction legacy (OPE-255).

**Chaque port = un firing « seam »** : interface + adapter + fakes + tests isolés, sans rien activer ;
puis un firing « branchement + activation ». Découpe stricte. Invariants sensibles (FEC, auth) =
tests bloquants + STOP/ALERT au moindre déséquilibre.
