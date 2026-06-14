# Audit — Onboarding artisan & profil légal : SIRET optionnel/non validé → factures sans SIRET → OPE-77

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : flux d'onboarding (`completeOnboarding`/`skipOnboarding` `routers.ts:7762-7798`,
> `getOnboardingStatus` `:7735`), création/MAJ profil artisan (`getOrCreateArtisan`,
> input `routers.ts:64/84`), schéma `artisans.siret` (`schema.ts:49`), rendu SIRET dans
> les générateurs PDF, fallback FEC (`index.ts:592`).

---

## 🟠 HIGH trouvé → **OPE-77** (issue créée)

**Le SIRET (mention légale obligatoire de toute facture) est optionnel, jamais validé,
et silencieusement omis** — 3 défauts cumulés :

1. **Optionnel partout** : `siret varchar(14)` nullable (`schema.ts:49`) ;
   `z.string().optional()` (`routers.ts:64/84`) ; `completeOnboarding` ne le collecte
   pas (metier/plan/modules seulement) ; `skipOnboarding` passe tout.
2. **Aucune validation** : `grep luhn|validateSiret|insee` → 0. Pas de contrôle 14
   chiffres / clé de Luhn.
3. **Omission silencieuse + pas de gate** : les 2 générateurs PDF rendent le SIRET
   conditionnellement (`if (artisan.siret)` — `pdfGenerator.ts:252/751/895`,
   `client/src/lib/pdfGenerator.ts:186`) → facture émise **sans SIRET** sans
   avertissement ; `grep !artisan.siret|require.*siret|profil.*incomplet` → 0 (rien ne
   bloque l'émission avec profil incomplet). FEC : fallback `'00000000000000'`
   (`index.ts:592`) → SIRET fictif.

**Distinct** du cluster « mentions obligatoires » existant (OPE-20 décennale, OPE-56
médiateur, OPE-21 franchise TVA) : il s'agit de l'**identité légale de base**. Distinct
aussi d'OPE-43 (plan auto-déclaré).

**Fix** (cf. OPE-77) : valider le format SIRET (14 chiffres + Luhn) ; **gate de
complétude avant émission de facture** (SIRET valide + raison sociale + adresse) — ce
gate peut aussi porter les mentions OPE-20/21/56 ; rendre le SIRET obligatoire avant la
1ʳᵉ facture ; remplacer le placeholder FEC par un refus explicite.

---

## Anti-doublon

Recherche Linear « SIRET / mentions légales / onboarding / profil incomplet » :
- OPE-20 (décennale), OPE-56 (médiateur), OPE-21 (TVA) = mentions **additionnelles**
  spécifiques, pas le SIRET.
- OPE-43 = plan auto-déclaré (gating modules), pas la conformité facture.
- OPE-7 = signup incomplet (artisan/subscription/permissions manquants), pas le SIRET.
→ Aucune issue ne couvre le SIRET/complétude légale → **OPE-77 créée** (pas de doublon).

---

## Autres points vérifiés (RAS / déjà tracés)

- `completeOnboarding` écrit `plan` depuis l'input client → **OPE-43** (déjà tracé).
- `skipOnboarding` rend l'onboarding entièrement contournable → pas une faille sécu en
  soi (l'app reste fonctionnelle via `getOrCreateArtisan`) ; converge avec OPE-77 (un
  profil non complété = factures non conformes).

---

## Verdict

Onboarding : le défaut bloquant est la **non-conformité facture par profil légal
incomplet** — SIRET optionnel, non validé, omis silencieusement, sans gate avant
émission → **OPE-77 (HIGH)**. Le reste (plan auto-déclaré) est déjà couvert par OPE-43.
