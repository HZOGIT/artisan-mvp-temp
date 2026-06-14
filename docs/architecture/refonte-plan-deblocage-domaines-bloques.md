# Plan de déblocage — `devis`, `commandesFournisseurs`, `avis`

> ✅ **VALIDÉ par l'utilisateur le 2026-06-14** — option retenue : **« LLM seam d'abord, puis activer au
> plus vite »** (faire le seam `LlmPort` puis enchaîner les procédures IA pour activer les domaines
> avant de revenir à la parité fine). Objectif : activer ces 3 domaines sur le new-stack staging.

## Carte des blocages

| Domaine | Procédures manquantes | Bloqueur(s) |
|---|---|---|
| **devis** | `genererLignesIA` | 🔴 **LLM** |
| | `sendByEmail` | 🟢 seam Pdf/Email **déjà prêt** (réutiliser le pattern factures) |
| | `convertToFacture` | 🟢 cross-domaine factures (faisable) |
| | `getModeles`/`getModeleWithLignes`/`createModele`/`addLigneToModele` | 🟢 domaine `modelesDevis` **déjà migré** — à exposer sous `devis.*` |
| | `duplicate`, `envoyerRelance`, `envoyerRelancesAutomatiques`, `getDevisNonSignes`, `getById` enrichi | 🟢 résiduel (relances déjà migré ; signature = simple read) |
| **commandesFournisseurs** | `genererDepuisDevisIA` | 🔴 **LLM** |
| | `sendEmail` (bon de commande PDF en PJ) | 🟢 seam Pdf/Email **déjà prêt** |
| **avis** | `getDemandeInfo`, `submitAvis` (publics par **token**) | 🔴 **surface publique sous RLS** |

→ **2 vrais bloqueurs lourds** : (A) **LLM port** et (B) **surface publique par token sous RLS**.
Le seam Pdf/Email (pièces jointes) est déjà livré (factures) — donc `sendByEmail`/`sendEmail` ne sont
**plus** bloqués.

---

## Bloqueur A — `LlmPort` (Gemini)

**Débloque** : `devis.genererLignesIA`, `commandesFournisseurs.genererDepuisDevisIA`, `articles.suggererArticlesIA` (bonus), et plus tard `assistant`/`devisIA` (SSE).

**Constat legacy** : provider = **Google GenAI** (`@google/genai`, `new GoogleGenAI({apiKey: GEMINI_API_KEY})`), modèle `gemini-2.5-flash`, streaming via `generateContentStream` (pour l'assistant). Erreurs assainies via `sanitizeIaError`.

**Approche (clean-archi)** :
1. `src/shared/ports/llm.ts` : `interface LlmPort { complete(prompt, opts?): Promise<string>; stream(prompt, opts?): AsyncIterable<string> }`.
2. Adapter `GeminiLlmAdapter` (`src/shared/ports/adapters.ts`, **import variable-de-chemin** → tsc src propre) sur `@google/genai`. `FakeLlmPort` déterministe (fakes) pour les tests.
3. Use-cases : `genererLignesDevisIA` (compose `LlmPort` + parse/valide le JSON renvoyé → lignes proposées, **non persistées** — le client les ajoute) ; `genererCommandeDepuisDevisIA` (compose `devisReader` + `LlmPort`). Rate-limit (anti-coût) + `sanitizeIaError`.
4. Tests via `FakeLlmPort` (déterministe) — aucun appel réseau en CI.

**Effort** : élevé. **Risque** : moyen (coût/latence/clé API ; pas d'invariant data). `GEMINI_API_KEY` en env staging (jamais committée).

---

## Bloqueur B — Surface publique par **token** sous RLS

**Débloque** : `avis.getDemandeInfo`/`submitAvis` (portail public d'avis) — **et pose les fondations de toute la surface §4 publique** (portail/vitrine par token).

**Constat** : ces procédures sont `publicProcedure` (pas de cookie tenant) ; elles lisent/écrivent `demandes_avis` + `avis` **par token**, **cross-tenant**. Sous RLS (`app_tenant`), un appel sans tenant courant ne voit rien → il faut un **chemin DB public**.

**Approche (clean-archi, sécurisée)** :
1. Introduire `publicProcedure` dans le routeur tRPC du new-stack (pas de résolution tenant).
2. **Chemin DB public scopé par capacité** : un repo/handle dédié qui n'autorise QUE les lectures/écritures strictement nécessaires, **toujours filtrées par le token** (le token EST l'autorisation), jamais par tenant. Option propre : politiques RLS dédiées « accès par token » OU connexion à rôle limité dédiée (lecture `demandes_avis` par token + jointures nom artisan/client/intervention ; écriture `avis` + maj `demandes_avis`).
3. Use-cases : `getInfoDemandeAvis(token)` (→ demande + noms tronqués + `isExpired`/`isCompleted`, **anti-oracle** : not-found uniforme) ; `soumettreAvisPublic({token, note 1–5, commentaire?})` (valide non-complétée + non-expirée → crée l'avis `publie` + marque la demande `completee` + notifie l'artisan).
4. Tests : token valide / inconnu / expiré / déjà complété + isolation.

**Effort** : élevé (fondation sécurité). **Risque** : élevé (exposition publique) → tests stricts, périmètre minimal, anti-oracle.

---

## Résiduel de parité (NON bloqué) à faire en parallèle

- **devis** : `getById` enrichi `{...devis, lignes, client}` ; `sendByEmail` (pattern factures) ; `convertToFacture` (use-cases factures) ; exposer `modelesDevis` sous `devis.getModeles`/`getModeleWithLignes`/`createModele`/`addLigneToModele` ; `duplicate` ; `envoyerRelance`/`envoyerRelancesAutomatiques` (domaine relances) ; `getDevisNonSignes`.
- **commandesFournisseurs** : `sendEmail` (bon de commande PDF en PJ — seam prêt).
- **avis** : seules `getDemandeInfo`/`submitAvis` manquent (le reste est déjà servi).

---

## Séquencement VALIDÉ (« LLM seam d'abord, puis activer au plus vite »)

1. **Seam `LlmPort` + `GeminiLlmAdapter` + `FakeLlmPort`** (1 firing, rien activé). ← **prochaine action**
2. **`commandesFournisseurs` — activation rapide** (le plus court chemin) : `sendEmail` (bon de commande PDF, **seam Pdf/email déjà prêt**) + `genererDepuisDevisIA` (LlmPort) → couverture complète → **ACTIVER commandesFournisseurs**.
3. **`devis` — activation** : `genererLignesIA` (LlmPort) **+** le résiduel non-IA requis (getById enrichi, sendByEmail, convertToFacture, exposer modelesDevis, duplicate, relances, getDevisNonSignes) — découpé sur quelques firings → **ACTIVER devis**.
4. **Surface publique par token** (fondation §4) → `avis.getDemandeInfo`/`submitAvis` → **ACTIVER avis** (débloque aussi portail/vitrine).

> Rationale ordre : après le seam LLM, **commandesFournisseurs** est le plus rapide à activer (2 procs,
> dont 1 sur seam déjà prêt) ; `devis` suit (plus de résiduel) ; `avis` en dernier (fondation publique).

> Chaque port = 1 firing « seam » (interface + adapter + fakes + tests, rien activé), puis firings
> « branchement + activation ». Invariants sensibles (auth, anti-oracle, isolation) = tests bloquants.
