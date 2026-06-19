# Mission — OPE-242 : rendre l'assistant IA (MonAssistant) vraiment utile

Tu es une session Claude Code autonome dédiée à **OPE-242** (projet Linear « Lancement 30 juin », équipe Operioz). Repo : `/home/developer/artisan-mvp-temp`, branche `staging` (repo git unique, pas de worktree). Lis d'abord l'issue **OPE-242** en entier (via le MCP Linear) — elle contient le diagnostic complet avec fichiers:lignes.

## Objectif

L'assistant `/assistant` est perçu comme « nul » : il n'explicite pas l'usage de ses outils, ne navigue pas naturellement vers la page « logique » après une action, et ne connaît qu'une fraction des pages. Rends-le **solide**, end-to-end, déployé sur staging et testé.

## Setup (obligatoire avant tout `task`/`docker`)

```bash
export DOCKER_HOST=unix:///run/user/1001/docker.sock
export PATH="/home/developer/.local/share/fnm/node-versions/v22.22.3/installation/bin:$PATH"
```

## Fichiers clés (déjà repérés)

- `server/_core/assistantContext.ts` — `buildSystemPrompt()` = le prompt système du chat texte.
- `server/_core/assistantTools.ts` — `AGENT_TOOLS` (21 outils) + `executeTool` + l'outil `naviguer_vers` (~ligne 344) + le handler (~ligne 1700).
- `server/_core/index.ts:1142` — `GEMINI_TEXT_MODEL` (modèle du chat). `:1226-1227` — émission de l'event `navigate` en SSE.
- `client/src/App.tsx:153-212` — la **carte complète des ~50 routes** de l'app.
- `client/src/pages/Assistant.tsx:314-319` — le front fait `setLocation(page + '?filtre=...')` pour N'IMPORTE QUEL chemin → les deep-links (`/devis/:id`) marchent déjà. **Ne casse pas ce contrat.**
- `.env.staging` — `GEMINI_TEXT_MODEL=gemini-2.5-flash` (voix déjà en `gemini-3.1-flash-live-preview`).

## Travail à faire (passe profonde)

1. **Modèle texte** : passer `GEMINI_TEXT_MODEL` à **`gemini-3.1-flash`** (parité avec la voix). **VALIDE d'abord** que cet id résout réellement contre l'API Gemini (un petit appel `generateContent` de test, ou vérifie la doc/SDK) ; si l'id exact diffère, prends le bon id `gemini-3.1-*` disponible. Garde le fallback `|| 'gemini-2.5-flash'` dans le code. Mets à jour `.env.staging` (et `.env.example`/dev si présents). Si tu ne peux pas valider l'id en confiance, NE change pas l'env aveuglément — documente et laisse le code prêt.
2. **`naviguer_vers`** : enrichis la description du paramètre `page` avec la **carte complète des pages** (toutes les routes de `App.tsx`) + documente les **deep-links** `/devis/:id`, `/factures/:id`, `/clients/:id`, `/contrats/:id`, `/commandes/:id`. Anti-hallucination : cadre les valeurs possibles.
3. **Prompt système — navigation POST-ACTION** (demande #1 de l'utilisateur) : après chaque outil de création/modif réussi, l'assistant ouvre/propose la page logique du document (`creer_devis` → `/devis/:id` ; `creer_facture` → `/factures/:id` ; `creer_client` → `/clients/:id` ; `creer_intervention` → `/interventions` ou `/calendrier` ; `creer_commande_fournisseur` → `/commandes/:id`). Vérifie que les outils renvoient bien l'id nécessaire au deep-link (sinon ajoute-le au retour de l'outil).
4. **Prompt système — carte mentale des pages** : section « quand aller où » couvrant TOUTE l'app (compta/FEC → /comptabilite, rentabilité chantier → /chantiers, dépenses/notes de frais, congés, véhicules, relances, devis-IA, avis, techniciens, prévisions…), pour orienter l'artisan même sans outil métier dédié.
5. **Explicitation d'usage des outils** : généralise les règles « recherche→action », « liste→navigation », « action→navigation » ; clarifie quand appeler chaque outil.
6. (Optionnel, si le temps le permet, en INCRÉMENT séparé) élargir la couverture : au minimum la navigation vers les pages manquantes ; outils d'action sur d'autres domaines = hors scope de cette première passe.

## Garde-fous

- **Behavior-preserving** sur l'existant : les navigations liste actuelles (factures impayées, devis envoyés) doivent continuer à marcher ; pas de route hallucinée (404). Pas de migration. Pas de changement de l'infra front (le contrat `navigate`/`setLocation` reste).
- Itère sur le prompt avec des **tests réels** sur staging avant de conclure.

## Vérifie / déploie (workflow repo)

- Gate serveur : `pnpm build:server` (esbuild — attention aux backticks dans les template literals du prompt !). Front si touché : `pnpm build`.
- Commit clair `feat(assistant): … (réf OPE-242)` finissant par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` → `git push origin staging` → `task staging:deploy` (serveur) → santé `curl -s -o /dev/null -w "%{http_code}" https://staging.operioz.com/` (200/302/401 OK ; 1er hit peut être 502 warmup → re-curl).
- ntfy à chaque étape : `curl -s -H "Title: OPE-242 assistant" -H "Tags: white_check_mark" -d "<résumé+commit+statut>" https://ntfy.sh/operioz-claude-code-2026`.

## QA manuelle (staging) — fais-la toi-même

Comptes : `dev+artisan@operioz.com` / `dev+artisan2@operioz.com` (mdp `Operioz-Test-2026`), cf. `docs/test-accounts.md`. Teste réellement le chat `/assistant` :
- « crée un devis pour <client> » → devis créé **ET** page `/devis/:id` ouverte.
- « montre-moi la compta » → `/comptabilite` ; « où je vois la rentabilité d'un chantier » → `/chantiers` ; « mes congés » → `/conges`.
- Enchaînement : « cherche le client Martin et crée-lui une intervention demain » → recherche → création → navigation.
- Régression : « mes factures impayées » → `/factures?filtre=impayees` (inchangé) ; aucune route 404.

## Linear (à la fin)

Sur **OPE-242** : `save_comment` « Implémenté + déployé staging (commit <sha>) — <résumé> » AVEC une section `## 🧪 Procédure de test (testeur humain)` complète (étapes numérotées sur https://staging.operioz.com + sous-section RÉGRESSION + multi-tenant). Puis `save_issue` → `state: "In Review"` + `labels: ["auto-fix-staging"]` si entièrement résolu ; sinon label seul + Backlog + périmètre restant détaillé.

Procède de façon autonome et itérative jusqu'à un assistant nettement meilleur, déployé et testé.
