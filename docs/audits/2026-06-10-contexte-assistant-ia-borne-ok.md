# Audit — Contexte de l'assistant IA : taille bornée (pas de scaling par tenant) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `buildSystemPrompt` / `getArtisanContext` (`server/_core/assistantContext.ts`)
> — données métier injectées dans le system prompt Gemini (texte + voix).

---

## Conclusion : prompt borné et caché. Pas de BLOCKER/HIGH.

Risque cherché : si le prompt embarque des **listes brutes** (tous les clients/devis/
factures), il **grossit avec la taille du tenant** → explosion du **coût Gemini**, de la
**latence**, et des **réponses vides** (le `finishReason=STOP` sur prompt trop long que
j'avais déjà mitigé). Pour un assistant facturé au token, c'est un risque coût/fiabilité.

### Les données injectées sont **agrégées et bornées** (O(1) vs taille du tenant)

- **Stats** : `getDashboardStats(artisanId)` (`:25`) = **agrégations SQL** (counts/totaux),
  ex. `${stats.facturesImpayees.count} factures impayées pour ${stats.facturesImpayees.total}`
  (`:56`). Indépendant du nombre de factures.
- **Clients récents** : `recentClients = clientsList.slice(0, 5)` (`:33-34`) → **5 noms
  max**, injectés en `Clients récents : ${recentClients}` (`:126`). Borné.
- **Aucun dump de liste** : le reste du prompt = instructions/règles + descriptions
  d'outils **statiques** (pas de `.map()`/`.join()` sur des collections d'entités dans le
  template).

→ La taille du prompt est **constante** quel que soit le volume de données du tenant
(10 ou 10 000 factures → même prompt). Le coût/latence Gemini ne dérive pas avec la
croissance des comptes.

### Cache

`getArtisanContext` est **caché 60 s** par `artisanId` (`CACHE_TTL_MS`, `cache` Map,
`:65-67`) → pas de re-calcul des agrégations à chaque tour de conversation.

---

## Réserves (LOW, non bloquantes)

1. La `Map` de cache n'est **jamais purgée** (entrées expirées par `expiresAt` mais non
   supprimées) — bornée par le **nombre d'artisans** (faible), entrées légères → pas un
   risque mémoire réel. Idem maps de rate-limit (même classe LOW).
2. La longueur du prompt reste dominée par le **bloc statique** d'instructions (~le fichier
   fait 15 k caractères) ; le garde anti-réponse-vide (retry + fallback, déjà en place côté
   `/api/assistant/stream`) couvre le `finishReason=STOP`.

---

## Verdict

Le contexte de l'assistant est **borné** (stats agrégées + 5 clients récents) et **caché
60 s** → le prompt **ne scale pas** avec la taille du tenant : pas d'explosion de coût/
latence/échec côté Gemini à mesure que les comptes grossissent. **Pas de nouvelle issue
Linear.**
